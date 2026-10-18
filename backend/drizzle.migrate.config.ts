import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';
import base from './drizzle.config.js';

config({
  path: [
    new URL('../.env', import.meta.url).pathname,
    new URL('./.env', import.meta.url).pathname,
  ],
  quiet: true,
});
const url = process.env.DATABASE_URL;
if (!url) throw new Error('Falta DATABASE_URL: configura .env en la raíz.');
if (!/^postgres(ql)?:\/\//.test(url)) {
  throw new Error('DATABASE_URL debe ser una URL PostgreSQL.');
}

export default defineConfig({ ...base, dbCredentials: { url } });
