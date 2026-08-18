import { createAsync, A, type RouteDefinition } from "@solidjs/router";
import { For, Show } from "solid-js";
import { getAllProjects } from "~/api";
import { Poppable } from "~/lib/poppable";

export const route = {
  preload() {
    return getAllProjects();
  }
} satisfies RouteDefinition;

export default function Projects() {
  const projects = createAsync(async () => getAllProjects(), { deferStream: true });

  return (
    <main class="projects-page">
      <Poppable as={A} class="back-link" href="/">
        ← Back to home
      </Poppable>
      <Poppable as="h1" class="projects-title">
        Projects
      </Poppable>
      <Show when={(projects()?.length ?? 0) > 0} fallback={<Poppable as="p">No projects submitted yet.</Poppable>}>
        <ul class="project-list">
          <For each={projects()}>
            {p => (
              <Poppable as="li" class="project-card" tiltStrength={3} tiltScale={0.03}>
                <img src={p.screenshotUrl} alt={p.name} draggable={false} />
                <div>
                  <h4>{p.name}</h4>
                  <p>{p.description}</p>
                  <p class="project-meta">
                    by {p.authorName} &middot; {p.hours.toFixed(1)}h
                  </p>
                  <p class="project-links">
                    <a href={p.codeUrl} target="_blank" rel="noopener noreferrer" draggable={false}>
                      Code
                    </a>
                    {" · "}
                    <a href={p.playableUrl} target="_blank" rel="noopener noreferrer" draggable={false}>
                      Play
                    </a>
                  </p>
                </div>
              </Poppable>
            )}
          </For>
        </ul>
      </Show>
    </main>
  );
}
