import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppError } from '../../src/application/errors.js';
import {
  hashPassword,
  LOGIN_FAILURES_PER_WINDOW,
  LocalAuthStore,
} from '../../src/infrastructure/local-auth.js';
import { createTestDatabase, type TestDatabase } from '../helpers/database.js';

const PASSWORD = 'Clave12345';
const email = () => `staff-${randomUUID()}@example.test`;

async function fails(promise: Promise<unknown>, status: number, code?: string) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).status).toBe(status);
  if (code) expect((error as AppError).code).toBe(code);
  return error as AppError;
}

describe('AUTH-LOCAL-001 autenticación local con PostgreSQL real', () => {
  let database: TestDatabase;
  let clock = new Date('2026-11-27T12:00:00Z');
  let store: LocalAuthStore;

  beforeAll(async () => {
    database = await createTestDatabase();
    store = new LocalAuthStore(database.pool, { now: () => clock });
  });
  afterAll(async () => {
    await database?.cleanup();
  });

  it('guarda un hash scrypt que no contiene la contraseña', async () => {
    const hash = await hashPassword(PASSWORD);
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(hash).not.toContain(PASSWORD);
    expect(await hashPassword(PASSWORD)).not.toBe(hash);
    const mail = email();
    const user = await store.createUser({
      email: mail,
      password: PASSWORD,
      fullName: 'Ana',
    });
    const row = (
      await database.pool.query('SELECT password_hash FROM users WHERE id=$1', [
        user.id,
      ])
    ).rows[0];
    expect(row.password_hash).toMatch(/^scrypt\$/);
    expect(row.password_hash).not.toContain(PASSWORD);
  });

  it('login correcto emite tokens de 43 caracteres y solo guarda sus hashes', async () => {
    const mail = email();
    const user = await store.createUser({
      email: mail,
      password: PASSWORD,
      fullName: 'Ana',
    });
    const session = await store.login(mail, PASSWORD);
    expect(session.access_token).toHaveLength(43);
    expect(session.refresh_token).toHaveLength(43);
    expect(session.user.id).toBe(user.id);
    const rows = (
      await database.pool.query(
        'SELECT access_hash,refresh_hash FROM staff_sessions WHERE user_id=$1',
        [user.id],
      )
    ).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].access_hash).not.toBe(session.access_token);
    expect(rows[0].refresh_hash).not.toBe(session.refresh_token);
    expect(rows[0].access_hash).toMatch(/^[0-9a-f]{64}$/);
    const leaked = await database.pool.query(
      'SELECT 1 FROM staff_sessions WHERE access_hash=$1 OR refresh_hash=$2',
      [session.access_token, session.refresh_token],
    );
    expect(leaked.rowCount).toBe(0);
  });

  it('contraseña errónea y correo inexistente responden 401 con el mismo mensaje', async () => {
    const mail = email();
    await store.createUser({
      email: mail,
      password: PASSWORD,
      fullName: 'Ana',
    });
    const wrong = await fails(store.login(mail, 'Otra12345'), 401);
    const missing = await fails(store.login(email(), PASSWORD), 401);
    expect(wrong.message).toBe(missing.message);
    expect(wrong.code).toBe(missing.code);
  });

  it('rechaza con 429 el 11.º intento fallido por correo, incluso con la contraseña correcta', async () => {
    const mail = email();
    await store.createUser({
      email: mail,
      password: PASSWORD,
      fullName: 'Ana',
    });
    for (let i = 0; i < LOGIN_FAILURES_PER_WINDOW; i++)
      await fails(store.login(mail, 'Mala12345'), 401);
    await fails(store.login(mail, 'Mala12345'), 429);
    await fails(store.login(mail, PASSWORD), 429);
    clock = new Date(clock.getTime() + 16 * 60 * 1000);
    expect((await store.login(mail, PASSWORD)).user.email).toBe(mail);
  });

  it('trata el correo sin distinguir mayúsculas y rechaza duplicados con 409 EMAIL_TAKEN', async () => {
    const mail = email();
    await store.createUser({
      email: mail,
      password: PASSWORD,
      fullName: 'Ana',
    });
    expect((await store.login(mail.toUpperCase(), PASSWORD)).user.email).toBe(
      mail,
    );
    await fails(
      store.createUser({
        email: mail.toUpperCase(),
        password: PASSWORD,
        fullName: 'Otra',
      }),
      409,
      'EMAIL_TAKEN',
    );
    await fails(store.signup(mail, PASSWORD, 'Otra'), 409, 'EMAIL_TAKEN');
  });

  it('verifyAccessToken devuelve el id y rechaza tokens inválidos o vencidos', async () => {
    const mail = email();
    const user = await store.createUser({
      email: mail,
      password: PASSWORD,
      fullName: 'Ana',
    });
    const session = await store.login(mail, PASSWORD);
    expect(await store.verifyAccessToken(session.access_token)).toEqual({
      id: user.id,
      email: mail,
      emailVerified: true,
    });
    await fails(store.verifyAccessToken('no-es-un-token'), 401);
    await fails(store.verifyAccessToken('A'.repeat(43)), 401);
    const real = clock;
    clock = new Date(real.getTime() + 24 * 60 * 60 * 1000 + 1000);
    try {
      await fails(store.verifyAccessToken(session.access_token), 401);
    } finally {
      clock = real;
    }
  });

  it('refresh rota la sesión: el refresh anterior deja de servir', async () => {
    const mail = email();
    await store.createUser({
      email: mail,
      password: PASSWORD,
      fullName: 'Ana',
    });
    const first = await store.login(mail, PASSWORD);
    const second = await store.refresh(first.refresh_token);
    expect(second.refresh_token).not.toBe(first.refresh_token);
    expect(second.access_token).not.toBe(first.access_token);
    await fails(store.refresh(first.refresh_token), 401);
    await fails(store.verifyAccessToken(first.access_token), 401);
    expect((await store.user(second.access_token)).email).toBe(mail);
  });

  it('logout revoca el acceso y el refresh de esa sesión', async () => {
    const mail = email();
    await store.createUser({
      email: mail,
      password: PASSWORD,
      fullName: 'Ana',
    });
    const session = await store.login(mail, PASSWORD);
    await store.logout(session.access_token);
    await fails(store.verifyAccessToken(session.access_token), 401);
    await fails(store.refresh(session.refresh_token), 401);
  });

  it('updatePassword cambia el hash, quita must_change_password y revoca las demás sesiones', async () => {
    const mail = email();
    const user = await store.createUser({
      email: mail,
      password: PASSWORD,
      fullName: 'Ana',
      mustChange: true,
    });
    expect(user.must_change_password).toBe(true);
    const before = (
      await database.pool.query('SELECT password_hash FROM users WHERE id=$1', [
        user.id,
      ])
    ).rows[0].password_hash;
    const current = await store.login(mail, PASSWORD);
    const other = await store.login(mail, PASSWORD);
    expect(current.user.must_change_password).toBe(true);
    await fails(store.updatePassword(current.access_token, 'corta1'), 400);
    await store.updatePassword(current.access_token, 'Nueva98765');
    const after = (
      await database.pool.query(
        'SELECT password_hash,must_change_password FROM users WHERE id=$1',
        [user.id],
      )
    ).rows[0];
    expect(after.password_hash).not.toBe(before);
    expect(after.must_change_password).toBe(false);
    expect((await store.user(current.access_token)).must_change_password).toBe(
      false,
    );
    await fails(store.verifyAccessToken(other.access_token), 401);
    await fails(store.login(mail, PASSWORD), 401);
    expect((await store.login(mail, 'Nueva98765')).user.id).toBe(user.id);
  });

  it('un usuario suspendido no entra ni conserva sesiones', async () => {
    const mail = email();
    const user = await store.createUser({
      email: mail,
      password: PASSWORD,
      fullName: 'Ana',
    });
    const session = await store.login(mail, PASSWORD);
    await database.pool.query(
      "UPDATE users SET status='suspended' WHERE id=$1",
      [user.id],
    );
    await fails(store.login(mail, PASSWORD), 401);
    await fails(store.verifyAccessToken(session.access_token), 401);
    await fails(store.refresh(session.refresh_token), 401);
  });

  it('rechaza contraseñas débiles con 400 sin crear la cuenta', async () => {
    for (const password of ['corta1', 'sololetras', '12345678', '']) {
      const mail = email();
      await fails(store.signup(mail, password, 'Ana'), 400, 'WEAK_PASSWORD');
      expect(
        (
          await database.pool.query(
            'SELECT 1 FROM users WHERE lower(email)=$1',
            [mail],
          )
        ).rowCount,
      ).toBe(0);
    }
  });
});
