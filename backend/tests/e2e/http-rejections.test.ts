import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/database.js';
import { type ServerType, serve } from '../helpers/http-server.js';

const restaurantId = 'abcdef01-2345-4678-abcd-0123456789ab';
const writes = [
  '/profiles',
  '/restaurants',
  `/restaurants/${restaurantId}/programs`,
  `/restaurants/${restaurantId}/purchases`,
];
const invalidRequests = writes.flatMap((path) => [
  {
    path,
    body: '{',
    contentType: 'application/json',
    description: 'JSON truncado',
  },
  {
    path,
    body: '{}',
    contentType: 'text/plain',
    description: 'tipo incorrecto',
  },
  { path, body: '[]', contentType: 'application/json', description: 'array' },
]);

describe('CORE/OPS HTTP real: rechazo antes de persistir', () => {
  let database: TestDatabase;
  let server: ServerType;
  let origin: string;
  let initialState: unknown;
  const subject = randomUUID();
  async function state() {
    const tables = await database.pool.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
    );
    const result: Record<string, unknown> = {};
    for (const { tablename } of tables.rows) {
      if (!/^[a-z_]+$/.test(tablename))
        throw new Error('Unexpected fixture table');
      result[tablename] = (
        await database.pool.query(`SELECT * FROM "${tablename}" ORDER BY id`)
      ).rows;
    }
    return result;
  }
  beforeAll(async () => {
    database = await createTestDatabase();
    await database.pool.query(
      "INSERT INTO users(id,full_name,email,status,created_at,updated_at) VALUES($1,'HTTP fixture','fixture@example.test','active',now(),now())",
      [subject],
    );
    initialState = await state();
    const app = createApp({
      pool: database.pool,
      cardTokenEncryptionKey: 'ab'.repeat(32),
      identityProvider: {
        async verifyAccessToken() {
          return {
            id: subject,
            email: 'fixture@example.test',
            emailVerified: true,
          };
        },
      },
    });
    await new Promise<void>((resolve) => {
      server = serve(
        { fetch: app.fetch, hostname: '127.0.0.1', port: 0 },
        ({ port }) => {
          origin = `http://127.0.0.1:${port}`;
          resolve();
        },
      );
    });
  });
  afterAll(async () => {
    try {
      if (server)
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
    } finally {
      await database?.cleanup();
    }
  });
  it.each(invalidRequests)(
    '$path: $description conserva todas las tablas',
    async ({ path, body, contentType }) => {
      const response = await fetch(`${origin}/api/v1${path}`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer fixture',
          'Content-Type': contentType,
          'Idempotency-Key': randomUUID(),
          'X-Request-Id': 'rejected-http',
        },
        body,
      });
      expect(response.status).toBe(400);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toMatchObject({
        error: { code: 'INVALID_INPUT', request_id: 'rejected-http' },
      });
      expect(await state()).toEqual(initialState);
    },
  );
  it('OPS AC-002 rechaza cuerpo HTTP con Content-Length excesivo y conserva BD', async () => {
    const response = await fetch(`${origin}/api/v1/profiles`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer fixture',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ full_name: 'x'.repeat(16385) }),
    });
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({
      error: { code: 'BODY_TOO_LARGE' },
    });
    expect(await state()).toEqual(initialState);
  });
});
