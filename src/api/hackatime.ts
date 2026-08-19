export type HackatimeProject = { name: string; text: string; totalSeconds: number };

// Only counts time logged during the program's active window. This admin
// endpoint takes plain YYYY-MM-DD (not the full ISO date-time the old
// non-admin /stats endpoint wanted).
export const HACKATIME_START_DATE = "2026-08-18";
export const HACKATIME_END_DATE = "2026-08-19";

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
