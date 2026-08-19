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

function hackatimeJustificationOf(hackatimeProjects: string[]): string {
  return hackatimeProjects.map(name => `${name} ${HACKATIME_DATE_RANGE}`).join(", ");
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
    const fingerprint = fingerprintOf(row);
    if (fingerprint === row.airtableSyncedFingerprint) continue;

    const profile = await fetchHcaProfile(row.userId);
    if (!profile) continue;

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

    let recordId = row.airtableRecordId;
    if (recordId) {
      await airtable.update(YswsProjectSubmissiontable, { id: recordId, ...fields });
    } else {
      recordId = (await airtable.insert(YswsProjectSubmissiontable, fields)).id;
    }

    await db
      .update(project)
      .set({ airtableRecordId: recordId, airtableSyncedFingerprint: fingerprint })
      .where(eq(project.id, row.id));
  }
}
