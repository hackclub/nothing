import { createAsync, A, type RouteDefinition } from "@solidjs/router";
import { Show, Switch, Match, For } from "solid-js";
import { getDashData, getMyProjects } from "~/api";
import { Poppable } from "~/lib/poppable";

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
      <Poppable as="h3" class="font-bold text-xl">
        Your projects
      </Poppable>
      <Show
        when={(projects()?.length ?? 0) > 0}
        fallback={<Poppable as="p">You haven't submitted a project yet.</Poppable>}
      >
        <ul class="project-list">
          <For each={projects()}>
            {p => (
              <Poppable as="li" class="project-card" tiltStrength={3} tiltScale={0.03}>
                <img src={p.screenshotUrl} alt={p.name} draggable={false} />
                <div>
                  <h4>{p.name}</h4>
                  <p>{p.description}</p>
                </div>
              </Poppable>
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
                <Poppable as="h2" class="font-bold text-3xl">
                  Hold tight
                </Poppable>
                <Poppable as="p">Your identity verification is still being reviewed. Check back later!</Poppable>
              </Match>

              <Match when={d().verificationStatus === "ineligible"}>
                <Poppable as="h2" class="font-bold text-3xl">
                  You're not eligible
                </Poppable>
                <Poppable as="p">Your identity verification wasn't approved, so you can't use Nothing.</Poppable>
              </Match>

              <Match when={d().verificationStatus === "verified" && !d().yswsEligible}>
                <Poppable as="h2" class="font-bold text-3xl">
                  Nothing is for teens
                </Poppable>
                <Poppable as="p">You're verified, but Nothing is only open to Hack Clubbers under 18.</Poppable>
              </Match>

              <Match when={d().verificationStatus === "verified" && d().yswsEligible}>
                <Poppable as="h2" class="font-bold text-3xl">
                  hi {d().user.name.split(" ")[0]}! it's great to see you {"<3"}
                </Poppable>
                <Poppable as="p" class="deadline-note">
                  Submissions close at 11:59pm ET on August 19th{" "}
                  <a href="https://internet-ti.me/@208" target="_blank" rel="noopener noreferrer" draggable={false}>
                    (@208 internet time)
                  </a>
                </Poppable>

                <Poppable as={A} class="bubble bubble-cta submit-link" popClass="bubble-pop" href="/submit">
                  Submit a project
                </Poppable>
                <Poppable as={A} class="bubble bubble-cta submit-link" popClass="bubble-pop" href="/leaderboard">
                  Nothingboard
                </Poppable>
                <Poppable as={A} class="bubble bubble-cta submit-link" popClass="bubble-pop" href="/projects">
                  View projects
                </Poppable>

                <MyProjects />
              </Match>
            </Switch>
          </>
        )}
      </Show>
    </main>
  );
}
