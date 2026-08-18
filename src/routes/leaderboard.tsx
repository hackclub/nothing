import { createAsync, A, type RouteDefinition } from "@solidjs/router";
import { For, Show } from "solid-js";
import { getLeaderboard } from "~/api";
import { Poppable } from "~/lib/poppable";

export const route = {
  preload() {
    return getLeaderboard();
  }
} satisfies RouteDefinition;

export default function Leaderboard() {
  const entries = createAsync(async () => getLeaderboard(), { deferStream: true });

  return (
    <main class="leaderboard-page">
      <Poppable as={A} class="back-link" href="/dash">
        ← Back to dashboard
      </Poppable>
      <Poppable as="h1" class="leaderboard-title">
        Nothingboard
      </Poppable>
      <Show when={(entries()?.length ?? 0) > 0} fallback={<Poppable as="p">No projects submitted yet.</Poppable>}>
        <ol class="leaderboard-list">
          <For each={entries()}>
            {(entry, i) => (
              <Poppable
                as="li"
                class="leaderboard-row"
                classList={{ "leaderboard-row-first": i() === 0 }}
                tiltStrength={3}
                tiltScale={0.03}
              >
                <span class="leaderboard-rank">{i() === 0 ? "♔" : `#${i() + 1}`}</span>
                {entry.slackId ? (
                  <img
                    class="leaderboard-avatar"
                    src={`https://cachet.hackclub.com/users/${entry.slackId}/r`}
                    alt=""
                    draggable={false}
                  />
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
              </Poppable>
            )}
          </For>
        </ol>
      </Show>
    </main>
  );
}
