import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { genericOAuth } from "better-auth/plugins";
import { db } from "~/api/db";
import { user, session, account, verification } from "../../auth-schema";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification }
  }),
  plugins: [
    genericOAuth({
      config: [
        {
          providerId: "hca",
          clientId: process.env.HCA_CLIENT_ID!,
          clientSecret: process.env.HCA_CLIENT_SECRET!,
          discoveryUrl: "https://auth.hackclub.com/.well-known/openid-configuration",
          scopes: ["openid", "profile", "name", "email", "slack_id", "verification_status", "address", "birthdate"]
        }
      ]
    })
  ]
});
