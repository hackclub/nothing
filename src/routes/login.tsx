import { type RouteSectionProps } from "@solidjs/router";
import { authClient } from "~/lib/auth-client";

export default function Login(props: RouteSectionProps) {
  return (
    <main>
      <h1>Login</h1>
      <button
        type="button"
        onClick={() =>
          authClient.signIn.oauth2({
            providerId: "hca",
            callbackURL: props.params.redirectTo ?? "/dash"
          })
        }
      >
        Login with Hack Club
      </button>
    </main>
  );
}
