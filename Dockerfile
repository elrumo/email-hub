# syntax=docker/dockerfile:1

# ---- build stage ----
FROM oven/bun:1.3.5 AS build
WORKDIR /app

# install deps (cached unless lockfile/manifest change)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# build the Nuxt app for the Bun preset
COPY . .
RUN bun --bun run build

# ---- runtime stage ----
FROM oven/bun:1.3.5-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# the built server (Bun preset → run with `bun .output/server/index.mjs`)
COPY --from=build /app/.output ./.output
# Drizzle migrations are NOT bundled into .output — ship them and point the
# engine plugin at them via NUXT_MIGRATIONS_DIR (see server/plugins/engine.ts).
COPY --from=build /app/server/db/migrations ./migrations

# SQLite database + any state live on a mounted volume here
ENV NUXT_DB_FILE=/data/app.db
ENV NUXT_MIGRATIONS_DIR=/app/migrations
# Dokploy OpenAPI spec (drives the auto-generated Dokploy actions); bundled into
# .output/public by Nitro. Point the loader at it explicitly.
ENV NUXT_DOKPLOY_SPEC=/app/.output/public/dokploy-api-spec.json
ENV HOST=0.0.0.0
ENV PORT=3000

VOLUME ["/data"]
EXPOSE 3000

# Healthcheck hits the auth-exempt /healthz route
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# MUST run under Bun (not node) so `bun:sqlite` resolves
CMD ["bun", "run", ".output/server/index.mjs"]
