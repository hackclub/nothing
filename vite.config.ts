import { defineConfig } from "vite";
import { nitro } from "nitro/vite";
import { solidStart } from "@solidjs/start/config";

export default defineConfig({
  plugins: [
    solidStart(),
    // Pinned explicitly: preset auto-detection is otherwise inconsistent
    // between environments (observed "node-server" locally vs "bun" in a
    // clean Docker build using the oven/bun image) — deployment should
    // always produce the same plain-Node-compatible server bundle.
    nitro({ preset: "node-server" })
  ],
  ssr: { external: ["drizzle-orm"] }
});
