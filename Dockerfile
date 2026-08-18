# syntax=docker/dockerfile:1

# --- deps: install with bun, cached separately from source changes ---
FROM oven/bun:1.3-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# --- build: produce the self-contained Nitro server bundle ---
FROM oven/bun:1.3-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build

# --- runtime: nothing but the built output — Nitro's node-server preset
# bundles all dependencies into .output/server, so no node_modules,
# package.json, or bun is needed here at all. ---
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app/.output ./.output
USER app

EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
