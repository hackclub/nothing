import { createAsync, useSubmission, type RouteDefinition } from "@solidjs/router";
import { For, Show } from "solid-js";
import { getDashData, getHackatimeProjects, submitProject } from "~/api";

export const route = {
  preload() {
    return Promise.all([getDashData(), getHackatimeProjects()]);
  }
} satisfies RouteDefinition;

export default function Submit() {
  const hackatimeProjects = createAsync(async () => getHackatimeProjects(), { deferStream: true });
  const submission = useSubmission(submitProject);

  return (
    <main class="submit-page">
      <h1 class="submit-title">Submit your project</h1>

      <form action={submitProject} method="post" enctype="multipart/form-data" class="submit-form">
        <label class="field">
          <span>Project name</span>
          <input type="text" name="name" required maxlength="120" />
        </label>

        <label class="field">
          <span>Description</span>
          <textarea name="description" required rows="4" />
        </label>

        <label class="field">
          <span>Code URL</span>
          <input type="url" name="codeUrl" required placeholder="https://github.com/you/project" />
        </label>

        <label class="field">
          <span>Playable URL</span>
          <input type="url" name="playableUrl" required placeholder="https://yourproject.dev" />
        </label>

        <label class="field">
          <span>Screenshot</span>
          <input type="file" name="screenshot" accept="image/png,image/jpeg,image/webp,image/gif" required />
        </label>

        <label class="field">
          <span>Hackatime projects (select at least one)</span>
          <span class="field-hint">Only time logged Aug 18–19, 2026 counts.</span>
          <Show
            when={(hackatimeProjects()?.length ?? 0) > 0}
            fallback={
              <p class="field-hint">
                No Hackatime time found for Aug 18–19, 2026 on your account — log some time with the Hackatime CLI
                first.
              </p>
            }
          >
            <select
              name="hackatimeProjects"
              multiple
              required
              size={Math.min(8, Math.max(3, hackatimeProjects()?.length ?? 3))}
            >
              <For each={hackatimeProjects()}>
                {p => (
                  <option value={p.name}>
                    {p.name} — {p.text}
                  </option>
                )}
              </For>
            </select>
          </Show>
        </label>

        <Show when={submission.error}>
          <p class="form-error">{submission.error instanceof Error ? submission.error.message : "Something went wrong"}</p>
        </Show>

        <button type="submit" class="bubble bubble-cta" disabled={submission.pending}>
          {submission.pending ? "Submitting…" : "Submit project"}
        </button>
      </form>
    </main>
  );
}
