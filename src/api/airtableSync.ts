import { eq } from "drizzle-orm";
import type { Attachment } from "airtable-ts";
import { db } from "~/api/db";
import { airtable } from "~/lib/airtable";
import { YswsProjectSubmissiontable, type YswsProjectSubmission } from "~/lib/airtable/appmxwVLLFD7VngR7";
import { fetchHcaProfile } from "~/api/hca";
import { HACKATIME_START_DATE, HACKATIME_END_DATE, resolveHackatimeUserId } from "~/api/hackatime";
import { project, user } from "../../auth-schema";

// Only the fields airtable-ts's toAirtable() for attachments actually reads
// (url, filename) matter — the rest of Attachment's shape is read-only metadata.
function toAttachment(url: string): Attachment {
  return { id: "", url, filename: "", size: 0, type: "" };
}

// The submission form only collects a code URL, not a GitHub username —
// parsed from that URL instead of asking for it separately.
function parseGithubUsername(codeUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(codeUrl);
  } catch {
    return null;
  }
  if (!/(^|\.)github\.com$/i.test(url.hostname)) return null;
  const [username] = url.pathname.split("/").filter(Boolean);
  return username ?? null;
}

function toUnixSeconds(isoDate: string): number | null {
  const date = new Date(isoDate);
  return Number.isNaN(date.getTime()) ? null : Math.floor(date.getTime() / 1000);
}

// "2026-08-18" -> "8/18/2026", matching the format Airtable's justification
// field asks for (see "Justification - Hackatime Project Name(s) + Date
// Range(s)" field description in the base).
function formatUsDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return `${month}/${day}/${year}`;
}

// Every project was measured over the same fixed program window (there's no
// per-project edit/resubmission flow that would narrow this to "since the
// last update"), so every selected Hackatime project name gets that same range.
const HACKATIME_DATE_RANGE = `${formatUsDate(HACKATIME_START_DATE)}-${formatUsDate(HACKATIME_END_DATE)}`;

// Airtable's long text fields cap out at 100,000 characters.
const MAX_JUSTIFICATION_LENGTH = 100_000;

function hackatimeJustificationOf(hackatimeProjects: string[]): string {
  // The same Hackatime project can end up selected more than once (e.g. the
  // submission form lists one <option> per Hackatime-reported project entry,
  // and duplicate-named entries aren't merged there) — list each distinct
  // name once rather than repeating "name range" per raw selection.
  const distinctNames = [...new Set(hackatimeProjects)];
  const justification = distinctNames.map(name => `${name} ${HACKATIME_DATE_RANGE}`).join(", ");
  return justification.slice(0, MAX_JUSTIFICATION_LENGTH);
}

// Airtable returns HTTP 404 with error "NOT_FOUND" when the record id no
// longer exists — e.g. someone deleted it in the Airtable UI.
function isRecordNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "statusCode" in error && error.statusCode === 404;
}

// A plain read, so an unchanged project only costs this (not a full
// HCA-identity-fetch-and-write) on the runs where nothing else changed.
async function airtableRecordExists(recordId: string): Promise<boolean> {
  try {
    await airtable.get(YswsProjectSubmissiontable, recordId);
    return true;
  } catch (error) {
    if (isRecordNotFoundError(error)) return false;
    throw error;
  }
}

// Cheap fingerprint of exactly the project fields that feed Airtable — NOT
// `project.updatedAt`, since that also bumps on unrelated writes (e.g. the
// live Hackatime hours recalculation) that shouldn't trigger a re-sync.
function fingerprintOf(row: { codeUrl: string; playableUrl: string; description: string; screenshotUrl: string }) {
  return JSON.stringify([row.codeUrl, row.playableUrl, row.description, row.screenshotUrl]);
}

// Runs every minute (see the "airtable:sync" scheduled task) to push
// submitted projects into the "YSWS Project Submission" Airtable base. Only
// projects whose synced fields have actually changed since the last run hit
// HCA/Airtable at all — an unchanged project costs nothing on the runs in
// between.
export async function syncProjectsToAirtable() {
  const rows = await db
    .select({
      id: project.id,
      userId: project.userId,
      codeUrl: project.codeUrl,
      playableUrl: project.playableUrl,
      description: project.description,
      screenshotUrl: project.screenshotUrl,
      hackatimeProjects: project.hackatimeProjects,
      hours: project.hours,
      slackId: user.slackId,
      airtableRecordId: project.airtableRecordId,
      airtableSyncedFingerprint: project.airtableSyncedFingerprint
    })
    .from(project)
    .innerJoin(user, eq(project.userId, user.id));

  for (const row of rows) {
    // One project's write failing (bad data, a transient Airtable error,
    // whatever) shouldn't stop every other project queued behind it in this
    // run from being synced — isolate each row and keep going.
    try {
      await syncOneProject(row);
    } catch (error) {
      console.error(`Failed to sync project ${row.id} to Airtable:`, error);
    }
  }
}

type ProjectRow = {
  id: string;
  userId: string;
  codeUrl: string;
  playableUrl: string;
  description: string;
  screenshotUrl: string;
  hackatimeProjects: string[];
  hours: number;
  slackId: string | null;
  airtableRecordId: string | null;
  airtableSyncedFingerprint: string | null;
};

async function syncOneProject(row: ProjectRow) {
  // Check this *before* the fingerprint short-circuit below — otherwise an
  // unchanged project whose Airtable record was deleted out from under us
  // (e.g. by hand in the Airtable UI) would never get re-created, since the
  // fingerprint match would skip it before we ever touched Airtable again.
  let recordId = row.airtableRecordId;
  if (recordId && !(await airtableRecordExists(recordId))) {
    recordId = null;
  }

  const fingerprint = fingerprintOf(row);
  if (recordId && fingerprint === row.airtableSyncedFingerprint) return;

  const profile = await fetchHcaProfile(row.userId);
  if (!profile) return;

  const hackatimeUserId = row.slackId ? await resolveHackatimeUserId(row.slackId) : null;

  const fields: Partial<Omit<YswsProjectSubmission, "id">> = {
    codeUrl: row.codeUrl,
    playableUrl: row.playableUrl,
    description: row.description,
    screenshot: [toAttachment(row.screenshotUrl)],
    githubUsername: parseGithubUsername(row.codeUrl),
    firstName: profile.firstName,
    lastName: profile.lastName,
    email: profile.email,
    birthday: profile.birthday ? toUnixSeconds(profile.birthday) : null,
    addressLine1: profile.address?.line1 ?? null,
    addressLine2: profile.address?.line2 ?? null,
    city: profile.address?.city ?? null,
    stateProvince: profile.address?.state ?? null,
    country: profile.address?.country ?? null,
    zipPostalCode: profile.address?.postalCode ?? null,
    optionalOverrideHoursSpent: row.hours,
    justificationHackatimeProjectNameSDateRangeS: hackatimeJustificationOf(row.hackatimeProjects),
    justificationSubmitterHackatimeId: hackatimeUserId !== null ? String(hackatimeUserId) : null
  };

  if (recordId) {
    try {
      await airtable.update(YswsProjectSubmissiontable, { id: recordId, ...fields });
    } catch (error) {
      // Covers the race where the record was deleted between the existence
      // check above and this write.
      if (!isRecordNotFoundError(error)) throw error;
      recordId = null;
    }
  }
  if (!recordId) {
    recordId = (await airtable.insert(YswsProjectSubmissiontable, fields)).id;
  }

  await db
    .update(project)
    .set({ airtableRecordId: recordId, airtableSyncedFingerprint: fingerprint })
    .where(eq(project.id, row.id));
}
