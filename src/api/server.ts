"use server";
import { redirect } from "@solidjs/router";
import { getWebRequest, appendResponseHeader } from "@solidjs/start/http";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { auth } from "~/lib/auth";
import { db } from "~/api/db";
import { project, user } from "../../auth-schema";

export async function getOptionalUser() {
  const request = getWebRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  return session?.user ?? null;
}

export type VerificationStatus = "pending" | "verified" | "ineligible";

// Identity verification status can change after the user first logs in (e.g.
// they finish verification later), so this is fetched live from Hack Club's
// identity server on every dashboard load rather than cached in our own DB —
// that also sidesteps trusting a value a signed-in user could otherwise spoof
// through a generic "update profile" endpoint if it were just a user column.
async function getIdentity() {
  const request = getWebRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) throw redirect("/login");

  const { accessToken } = await auth.api.getAccessToken({
    headers: request.headers,
    body: { providerId: "hca" }
  });

  const res = await fetch("https://auth.hackclub.com/oauth/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) throw new Error("Failed to fetch identity verification status");
  const info: { verification_status?: string; ysws_eligible?: boolean; slack_id?: string } = await res.json();

  if (info.verification_status === "needs_submission" || !info.verification_status) {
    throw redirect("https://auth.hackclub.com/identity");
  }

  // Persisted (not just returned) so it's available later for displaying
  // OTHER users' avatars — e.g. the leaderboard has no OAuth session for
  // anyone but the current viewer, so it needs this stored ahead of time.
  if (info.slack_id) {
    await db.update(user).set({ slackId: info.slack_id }).where(eq(user.id, session.user.id));
  }

  return {
    user: session.user,
    verificationStatus: info.verification_status as VerificationStatus,
    yswsEligible: Boolean(info.ysws_eligible),
    slackId: info.slack_id
  };
}

// Only verified + eligible users may reach the parts of the app past the
// dashboard's gate (submitting projects, etc). Bounces anyone else back to
// /dash where the actual reason (pending/ineligible/too old) is explained.
async function requireEligibleIdentity() {
  const identity = await getIdentity();
  if (identity.verificationStatus !== "verified" || !identity.yswsEligible) throw redirect("/dash");
  return identity;
}

export async function getDashData() {
  return getIdentity();
}

export type HackatimeProject = { name: string; text: string; totalSeconds: number };

// Only counts time logged during the program's active window.
const HACKATIME_START_DATE = "2026-08-18T00:00:00Z";
const HACKATIME_END_DATE = "2026-08-19T23:59:59Z";

async function fetchHackatimeProjects(slackId: string): Promise<HackatimeProject[]> {
  // `features` defaults to "languages" only — without explicitly asking for
  // "projects" here, `data.projects` is just absent from the response.
  const params = new URLSearchParams({
    features: "projects",
    start_date: HACKATIME_START_DATE,
    end_date: HACKATIME_END_DATE
  });
  const res = await fetch(`https://hackatime.hackclub.com/api/v1/users/${slackId}/stats?${params}`, {
    headers: { Authorization: `Bearer ${process.env.HACKATIME_API_KEY}` }
  });
  if (!res.ok) return [];

  const body: {
    data?: { projects?: { name?: string; text?: string; total_seconds?: number }[] };
  } = await res.json();

  return (body.data?.projects ?? [])
    .filter((p): p is { name: string; text?: string; total_seconds?: number } => Boolean(p.name))
    .map(p => ({
      name: p.name,
      text: p.text ?? "0m",
      totalSeconds: p.total_seconds ?? 0
    }));
}

export async function getHackatimeProjects(): Promise<HackatimeProject[]> {
  const { slackId } = await requireEligibleIdentity();
  if (!slackId) return [];
  return fetchHackatimeProjects(slackId);
}

const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024;
const ALLOWED_SCREENSHOT_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

// Hosted on Hack Club's CDN rather than our own disk — a blob store gives us
// real persistence (no per-instance local disk to lose) and a stable public
// URL with no server-side file-serving route of our own to maintain.
async function uploadScreenshot(file: File): Promise<string> {
  const cdnForm = new FormData();
  cdnForm.append("file", file);

  const res = await fetch("https://cdn.hackclub.com/api/v4/upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.CDN_API_KEY}` },
    body: cdnForm
  });

  if (!res.ok) {
    const body: { error?: string } = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to upload screenshot to the CDN");
  }

  const data: { url: string } = await res.json();
  return data.url;
}

export async function submitProject(formData: FormData) {
  const { user: sessionUser, slackId } = await requireEligibleIdentity();

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const codeUrl = String(formData.get("codeUrl") ?? "").trim();
  const playableUrl = String(formData.get("playableUrl") ?? "").trim();
  const hackatimeProjects = formData.getAll("hackatimeProjects").map(String).filter(Boolean);
  const screenshot = formData.get("screenshot");

  if (!name || !description || !codeUrl || !playableUrl) {
    throw new Error("Missing required fields");
  }
  if (hackatimeProjects.length === 0) {
    throw new Error("Select at least one Hackatime project");
  }
  if (!(screenshot instanceof File) || screenshot.size === 0) {
    throw new Error("Screenshot is required");
  }
  if (screenshot.size > MAX_SCREENSHOT_BYTES) {
    throw new Error("Screenshot is too large (max 8MB)");
  }
  if (!ALLOWED_SCREENSHOT_TYPES.has(screenshot.type)) {
    throw new Error("Screenshot must be a PNG, JPEG, WebP, or GIF image");
  }

  // Re-fetch live rather than trusting anything the client sent — the
  // dropdown only ever showed project names, never a number a form field
  // could smuggle in a fabricated hour count through.
  const liveProjects = slackId ? await fetchHackatimeProjects(slackId) : [];
  const totalSeconds = liveProjects
    .filter(p => hackatimeProjects.includes(p.name))
    .reduce((sum, p) => sum + p.totalSeconds, 0);
  const hours = totalSeconds / 3600;

  const screenshotUrl = await uploadScreenshot(screenshot);

  await db.insert(project).values({
    id: randomUUID(),
    userId: sessionUser.id,
    name,
    description,
    codeUrl,
    playableUrl,
    screenshotUrl,
    hackatimeProjects,
    hours
  });

  throw redirect("/dash");
}

export async function getMyProjects() {
  const { user: sessionUser } = await requireEligibleIdentity();
  return db.select().from(project).where(eq(project.userId, sessionUser.id));
}

export type LeaderboardEntry = {
  userId: string;
  name: string;
  slackId: string | null;
  hours: number;
  projectCount: number;
};

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  const rows = await db
    .select({
      userId: project.userId,
      name: user.name,
      slackId: user.slackId,
      hours: sql<number>`sum(${project.hours})`.mapWith(Number),
      projectCount: sql<number>`count(*)`.mapWith(Number)
    })
    .from(project)
    .innerJoin(user, eq(project.userId, user.id))
    .groupBy(project.userId, user.name, user.slackId)
    .orderBy(sql`sum(${project.hours}) desc`);

  return rows;
}

export async function logout() {
  const request = getWebRequest();
  const response = await auth.api.signOut({ headers: request.headers, asResponse: true });
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") appendResponseHeader(key, value);
  });
  throw redirect("/");
}
