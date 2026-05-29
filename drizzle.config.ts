import { defineConfig } from 'drizzle-kit'

// Migrations are generated here and applied at runtime by server/db/index.ts
// (drizzle-orm/bun-sqlite/migrator) against the DB on the /data volume.
export default defineConfig({
  dialect: 'sqlite',
  schema: './server/db/schema.ts',
  out: './server/db/migrations',
  // dbCredentials is only needed for `drizzle-kit push`/`studio`; generate
  // doesn't connect. Point at the dev DB for those subcommands.
  dbCredentials: {
    url: process.env.NUXT_DB_FILE || './.data/app.db'
  }
})
