import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { AppError } from '../../src/application/errors.js';
import { createTestDatabase, type TestDatabase } from '../helpers/database.js';
import type { ServerType } from '../helpers/http-server.js';
import { serve } from '../helpers/http-server.js';

describe('IDENTITY-001 HTTP real y PostgreSQL aislado', () => {
  let database: TestDatabase;
  let server: ServerType;
  let origin: string;
  let subject: string;
  beforeEach(() => {
    subject = randomUUID();
  });
  beforeAll(async () => {
    database = await createTestDatabase();
    const app = createApp({
      pool: database.pool,
      cardTokenEncryptionKey: 'ab'.repeat(32),
      identityProvider: {
        async verifyAccessToken(token) {
          if (
            !['email-session', 'google-session', 'unverified'].includes(token)
          )
            throw new AppError(401, 'UNAUTHENTICATED', 'Sesión inválida.');
          return {
            id: subject,
            email: 'client@example.test',
            emailVerified: token !== 'unverified',
          };
        },
      },
    });
    await new Promise<void>((resolve) => {
      server = serve(
        { fetch: app.fetch, port: 0, hostname: '127.0.0.1' },
        ({ port }) => {
          origin = `http://127.0.0.1:${port}`;
          resolve();
        },
      );
    });
  });
  afterAll(async () => {
    if (server)
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    if (database) await database.cleanup();
  });
  const request = (
    path: string,
    token?: string,
    method = 'GET',
    body?: unknown,
  ) =>
    fetch(`${origin}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  it('AC-001 rechaza sesiones ausentes/no verificadas sin persistir', async () => {
    expect(
      (
        await request('/api/v1/profiles', undefined, 'POST', {
          full_name: 'Client',
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await request('/api/v1/profiles', 'unverified', 'POST', {
          full_name: 'Client',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await database.pool.query(
          'SELECT count(*)::int AS n FROM users WHERE id=$1',
          [subject],
        )
      ).rows[0].n,
    ).toBe(0);
  });
  it('AC-002 ambas sesiones del mismo sujeto reutilizan perfil sin contraseña', async () => {
    const first = await request('/api/v1/profiles', 'email-session', 'POST', {
      full_name: 'Client',
    });
    expect(first.status).toBe(201);
    expect((await first.json()).data.id).toBe(subject);
    const repeat = await request('/api/v1/profiles', 'google-session', 'POST', {
      full_name: 'Changed',
    });
    expect(repeat.status).toBe(200);
    expect((await repeat.json()).data.full_name).toBe('Client');
    const rows = (
      await database.pool.query('SELECT password_hash FROM users WHERE id=$1', [
        subject,
      ])
    ).rows;
    expect(rows).toEqual([{ password_hash: null }]);
  });
  async function registeredProfile() {
    const registered = await request(
      '/api/v1/profiles',
      'email-session',
      'POST',
      {
        full_name: 'Client',
        phone: '12345',
      },
    );
    expect(registered.status).toBe(201);
  }
  it('AC-003 actualiza campos propios y rechaza roles/email sin cambios', async () => {
    await registeredProfile();
    const updated = await request('/api/v1/me', 'email-session', 'PATCH', {
      phone: '67890',
    });
    expect(updated.status).toBe(200);
    expect((await updated.json()).data.phone).toBe('67890');
    const invalid = await request('/api/v1/me', 'email-session', 'PATCH', {
      full_name: 'Hijack',
      role: 'owner',
    });
    expect(invalid.status).toBe(400);
    const failure = await invalid.json();
    expect(failure.error.request_id).toBe(invalid.headers.get('x-request-id'));
    const me = await request('/api/v1/me', 'google-session');
    const data = (await me.json()).data;
    expect(data.full_name).toBe('Client');
    expect(data.phone).toBe('67890');
    expect(data).not.toHaveProperty('password_hash');
  });
  it('AC-004 suspensión impide consultar y modificar', async () => {
    await registeredProfile();
    await database.pool.query(
      "UPDATE users SET status = 'suspended' WHERE id = $1",
      [subject],
    );
    expect((await request('/api/v1/me', 'email-session')).status).toBe(403);
    expect(
      (await request('/api/v1/me', 'email-session', 'PATCH', { phone: '999' }))
        .status,
    ).toBe(403);
    expect(
      (
        await database.pool.query('SELECT phone FROM users WHERE id=$1', [
          subject,
        ])
      ).rows[0].phone,
    ).toBe('12345');
  });
});
