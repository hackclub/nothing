# syntax=docker/dockerfile:1

# --- deps: full install (incl. devDependencies), used to build ---
FROM oven/bun:1.3-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# --- prod-deps: production-only install, used at runtime for migrations ---
# (drizzle-orm/postgres are real `dependencies`; drizzle-kit itself is a
# devDependency and isn't needed here — the migrator API below doesn't use it)
FROM oven/bun:1.3-alpine AS prod-deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# --- build: produce the self-contained Nitro server bundle ---
FROM oven/bun:1.3-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build

# --- runtime ---
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

RUN addgroup -S app && adduser -S app -G app

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/.output ./.output
COPY drizzle ./drizzle
COPY scripts/migrate.mjs ./migrate.mjs

USER app
EXPOSE 3000
# Migrations run on every boot — safe here since drizzle's migrator tracks
# applied migrations in its own table and this is expected to be a
# single-replica deployment; revisit with an advisory lock or a separate
# migration step if this ever scales to multiple concurrent replicas.
CMD ["sh", "-c", "node migrate.mjs && node .output/server/index.mjs"]
