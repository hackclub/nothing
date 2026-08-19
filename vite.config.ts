import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { nitro } from "nitro/vite";
import { solidStart } from "@solidjs/start/config";

const airtableSyncTask = fileURLToPath(new URL("./src/tasks/airtableSync.ts", import.meta.url));

export default defineConfig({
  plugins: [
    solidStart(),
    // Pinned explicitly: preset auto-detection is otherwise inconsistent
    // between environments (observed "node-server" locally vs "bun" in a
    // clean Docker build using the oven/bun image) — deployment should
    // always produce the same plain-Node-compatible server bundle.
    nitro({
      preset: "node-server",
      experimental: { tasks: true },
      tasks: {
        // Absolute path — a relative one fails to resolve from Nitro's
        // virtual tasks module (it isn't resolved relative to this file).
        "airtable:sync": { handler: airtableSyncTask }
      },
      scheduledTasks: {
        "* * * * *": "airtable:sync"
      }
    })
  ],
  ssr: { external: ["drizzle-orm"] }
});
