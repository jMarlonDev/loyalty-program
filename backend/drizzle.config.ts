import { defineConfig } from 'drizzle-kit';

// generate y check son locales: no cargan secretos ni se conectan a PostgreSQL.
export default defineConfig({
  schema: './db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  strict: true,
  verbose: false,
});
