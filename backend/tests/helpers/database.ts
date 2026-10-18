import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate as migrateDrizzle } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import * as schema from '../../db/schema.js';

function destination(url: URL) {
  const host = url.hostname === 'localhost' ? '127.0.0.1' : url.hostname;
  return `${host}:${url.port || '5432'}${url.pathname}`;
}

export function validateTestDatabaseUrl(
  value: string | undefined,
  developmentUrl?: string,
) {
  const error = new Error(
    'TEST_DATABASE_URL debe indicar PostgreSQL local con una base loyalty_test_* y sin parámetros.',
  );
  let url: URL;
  try {
    url = new URL(value ?? '');
  } catch {
    throw error;
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    !/^\/loyalty_test_[a-zA-Z0-9_]+$/.test(url.pathname) ||
    url.search ||
    url.hash
  )
    throw error;

  if (developmentUrl) {
    let development: URL;
    try {
      development = new URL(developmentUrl);
    } catch {
      throw new Error(
        'DATABASE_URL no válida; no se puede comprobar el aislamiento de pruebas.',
      );
    }
    if (destination(url) === destination(development)) {
      throw new Error(
        'TEST_DATABASE_URL no puede coincidir con el destino de DATABASE_URL.',
      );
    }
  }
  return url;
}

export async function createTestDatabase(options: { migrate?: boolean } = {}) {
  const controlUrl = validateTestDatabaseUrl(
    process.env.TEST_DATABASE_URL,
    process.env.DATABASE_URL,
  );
  const name = `loyalty_test_${randomUUID().replaceAll('-', '')}`;
  const control = new pg.Client({
    connectionString: controlUrl.href,
    connectionTimeoutMillis: 5000,
  });
  try {
    await control.connect();
    await control.query(`CREATE DATABASE "${name}"`);
  } catch (error) {
    await control.end();
    throw error;
  }
  const suiteUrl = new URL(controlUrl);
  suiteUrl.pathname = `/${name}`;
  const pool = new pg.Pool({
    connectionString: suiteUrl.href,
    connectionTimeoutMillis: 5000,
  });
  const db = drizzle(pool, { schema });
  let cleanupPromise: Promise<void> | undefined;
  const cleanup = () => {
    cleanupPromise ??= (async () => {
      try {
        await pool.end();
        await control.query(`DROP DATABASE "${name}"`);
      } finally {
        await control.end();
      }
    })();
    return cleanupPromise;
  };
  const migrate = () =>
    migrateDrizzle(db, {
      migrationsFolder: fileURLToPath(
        new URL('../../drizzle/', import.meta.url),
      ),
    });
  try {
    if (options.migrate !== false) await migrate();
  } catch (error) {
    await cleanup();
    throw error;
  }
  return { pool, db, migrate, cleanup };
}

export type TestDatabase = Awaited<ReturnType<typeof createTestDatabase>>;
