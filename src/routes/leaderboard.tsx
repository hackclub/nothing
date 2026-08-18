import { createAsync, A, type RouteDefinition } from "@solidjs/router";
import { For, Show } from "solid-js";
import { getLeaderboard } from "~/api";

export const route = {
  preload() {
    return getLeaderboard();
  }
} satisfies RouteDefinition;

export default function Leaderboard() {
  const entries = createAsync(async () => getLeaderboard(), { deferStream: true });

  return (
    <main class="leaderboard-page">
      <A href="/dash" class="back-link">
        ← Back to dashboard
      </A>
      <h1 class="leaderboard-title">Nothingboard</h1>
      <Show when={(entries()?.length ?? 0) > 0} fallback={<p>No projects submitted yet.</p>}>
        <ol class="leaderboard-list">
          <For each={entries()}>
            {(entry, i) => (
              <li class="leaderboard-row" classList={{ "leaderboard-row-first": i() === 0 }}>
                <span class="leaderboard-rank">{i() === 0 ? "♔" : `#${i() + 1}`}</span>
                {entry.slackId ? (
                  <img class="leaderboard-avatar" src={`https://cachet.hackclub.com/users/${entry.slackId}/r`} alt="" />
                ) : (
                  <span class="leaderboard-avatar leaderboard-avatar-placeholder" aria-hidden="true" />
                )}
                <span class="leaderboard-namewrap">
                  <Show when={i() === 0}>
                    <span class="leaderboard-royal-badge">Royal Nothing</span>
                  </Show>
                  <span class="leaderboard-name">{entry.name}</span>
                </span>
                <span class="leaderboard-hours">{entry.hours.toFixed(1)}h</span>
                <span class="leaderboard-count">
                  {entry.projectCount} project{entry.projectCount === 1 ? "" : "s"}
                </span>
              </li>
            )}
          </For>
        </ol>
      </Show>
    </main>
  );
}
