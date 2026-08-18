import { createAsync } from "@solidjs/router";
import { Show } from "solid-js";
import { getOptionalUser, logout } from "~/api";
import { Poppable } from "~/lib/poppable";

// Rendered once in the router root (src/app.tsx), not per-route, so it
// persists across every page — including client-side navigations between
// them — for as long as a session exists.
export default function LogoutBubble() {
  const user = createAsync(async () => getOptionalUser(), { deferStream: true });

  return (
    <Show when={user()}>
      <form action={logout} method="post" class="logout-form">
        <Poppable
          as="button"
          type="submit"
          name="logout"
          class="bubble logout-bubble"
          popClass="bubble-pop"
          tiltStrength={6}
          tiltScale={0.08}
          aria-label="Log out"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </Poppable>
      </form>
    </Show>
  );
}
