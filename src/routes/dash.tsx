import { createAsync, A, type RouteDefinition } from "@solidjs/router";
import { Show, Switch, Match, For } from "solid-js";
import { getDashData, getMyProjects } from "~/api";

export const route = {
  preload() {
    return getDashData();
  }
} satisfies RouteDefinition;

// getMyProjects() itself redirects non-eligible users back to /dash, so it
// must only ever be called from within the eligible branch below — never
// preloaded unconditionally, or a pending/ineligible visitor to /dash would
// bounce right back to /dash in a loop.
function MyProjects() {
  const projects = createAsync(async () => getMyProjects(), { deferStream: true });

  return (
    <section class="my-projects">
      <h3 class="font-bold text-xl">Your projects</h3>
      <Show when={(projects()?.length ?? 0) > 0} fallback={<p>You haven't submitted a project yet.</p>}>
        <ul class="project-list">
          <For each={projects()}>
            {p => (
              <li class="project-card">
                <img src={p.screenshotUrl} alt={p.name} />
                <div>
                  <h4>{p.name}</h4>
                  <p>{p.description}</p>
                </div>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </section>
  );
}

export default function Dash() {
  const data = createAsync(async () => getDashData(), { deferStream: true });

  return (
    <main class="w-full p-4 space-y-2">
      <Show when={data()}>
        {d => (
          <>
            <Switch>
              <Match when={d().verificationStatus === "pending"}>
                <h2 class="font-bold text-3xl">Hold tight</h2>
                <p>Your identity verification is still being reviewed. Check back later!</p>
              </Match>

              <Match when={d().verificationStatus === "ineligible"}>
                <h2 class="font-bold text-3xl">You're not eligible</h2>
                <p>Your identity verification wasn't approved, so you can't use Nothing.</p>
              </Match>

              <Match when={d().verificationStatus === "verified" && !d().yswsEligible}>
                <h2 class="font-bold text-3xl">Nothing is for teens</h2>
                <p>You're verified, but Nothing is only open to Hack Clubbers under 18.</p>
              </Match>

              <Match when={d().verificationStatus === "verified" && d().yswsEligible}>
                <h2 class="font-bold text-3xl">hi {d().user.name.split(" ")[0]}! it's great to see you {"<3"}</h2>

                <A href="/submit" class="bubble bubble-cta submit-link">
                  Submit a project
                </A>
                <A href="/leaderboard" class="bubble bubble-cta submit-link">
                  Nothingboard
                </A>

                <MyProjects />
              </Match>
            </Switch>
          </>
        )}
      </Show>
    </main>
  );
}
