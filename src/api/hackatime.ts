export type HackatimeProject = { name: string; text: string; totalSeconds: number };

// Only counts time logged during the program's active window. This admin
// endpoint takes plain YYYY-MM-DD (not the full ISO date-time the old
// non-admin /stats endpoint wanted) and treats it as a UTC calendar day.
//
// The program's window is framed in ET ("Submissions close at 11:59pm ET on
// August 19th"), which runs 4 hours behind UTC in August — 11:59pm ET on the
// 19th is 3:59am UTC on the 20th. Since there's no way to express that
// half-day boundary with date-only params, the end date is pushed out to the
// 20th so nobody's last few hours of legitimate Aug 19th (ET) time get
// silently dropped for having landed after UTC midnight.
export const HACKATIME_START_DATE = "2026-08-18";
export const HACKATIME_END_DATE = "2026-08-20";

// The program's actual last day, for anything shown to a human (the
// Airtable justification field, submission copy) — as opposed to
// HACKATIME_END_DATE above, which is padded a day to work around the API's
// UTC-day boundary and would otherwise misstate the window as ending a day
// later than it really did.
export const HACKATIME_DISPLAY_END_DATE = "2026-08-19";

function formatHours(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

// The admin projects endpoint only takes Hackatime's own internal numeric
// user id — not the Slack ID we store — so it has to be resolved first.
export async function resolveHackatimeUserId(slackId: string): Promise<number | null> {
  const res = await fetch(`https://hackatime.hackclub.com/api/v1/users/lookup_slack_uid/${slackId}`, {
    headers: { Authorization: `Bearer ${process.env.HACKATIME_API_KEY}` }
  });
  if (!res.ok) return null;
  const body: { user_id?: number } = await res.json();
  return body.user_id ?? null;
}

export async function fetchHackatimeProjects(slackId: string): Promise<HackatimeProject[]> {
  const userId = await resolveHackatimeUserId(slackId);
  if (userId === null) return [];

  const params = new URLSearchParams({
    user_id: String(userId),
    start_date: HACKATIME_START_DATE,
    end_date: HACKATIME_END_DATE
  });
  const res = await fetch(`https://hackatime.hackclub.com/api/admin/v1/user/projects?${params}`, {
    headers: { Authorization: `Bearer ${process.env.HACKATIME_API_KEY}` }
  });
  if (!res.ok) return [];

  const body: {
    projects?: { name: string | null; total_duration?: number }[];
  } = await res.json();

  return (body.projects ?? [])
    .filter((p): p is { name: string; total_duration?: number } => Boolean(p.name))
    .map(p => {
      const totalSeconds = p.total_duration ?? 0;
      return { name: p.name, text: formatHours(totalSeconds), totalSeconds };
    });
}
