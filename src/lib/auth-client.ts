import { createAuthClient } from "better-auth/solid";
import { genericOAuthClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [genericOAuthClient()]
});
