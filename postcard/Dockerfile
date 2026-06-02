# Postcard — single-stage Bun image. Nuxt builds to a Nitro server bundle that
# Bun runs directly. The DB lives in a sibling Postgres container (compose).
FROM oven/bun:1.3.5 AS build
WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile || bun install

COPY . .
RUN bun --bun nuxt build

FROM oven/bun:1.3.5
WORKDIR /app
ENV NODE_ENV=production
ENV NITRO_PORT=3000
ENV NITRO_HOST=0.0.0.0

COPY --from=build /app/.output ./.output
COPY --from=build /app/server/db/migrations ./server/db/migrations

EXPOSE 3000
CMD ["bun", "--bun", ".output/server/index.mjs"]
