import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestDatabase,
  type TestDatabase,
  validateTestDatabaseUrl,
} from '../helpers/database.js';

describe('TESTDB-001: migraciones PostgreSQL reales', () => {
  let database: TestDatabase;
  beforeAll(async () => {
    database = await createTestDatabase();
  });
  afterAll(async () => {
    await database?.cleanup();
  });

  it('AC-002/003: crea las 29 tablas y reaplica sin duplicar historial ni datos', async () => {
    const tables = await database.pool.query(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
    );
    expect(tables.rowCount).toBe(29);
    const id = randomUUID();
    await database.pool.query(
      "INSERT INTO users (id, full_name, status, created_at, updated_at) VALUES ($1, 'Fixture', 'active', now(), now())",
      [id],
    );
    await database.migrate();
    const history = await database.pool.query(
      'SELECT * FROM drizzle.__drizzle_migrations',
    );
    expect(history.rowCount).toBe(11);
    expect(
      (await database.pool.query('SELECT id FROM users WHERE id = $1', [id]))
        .rowCount,
    ).toBe(1);
  });

  it('AC-004: rechaza CHECK y unicidad sin persistir filas inválidas', async () => {
    const insert =
      'INSERT INTO restaurants (id, name, status, created_at, updated_at) VALUES ($1, $2, $3, now(), now())';
    const id = randomUUID();
    await database.pool.query(insert, [id, 'Fixture', 'active']);
    await expect(
      database.pool.query(insert, [id, 'Duplicate', 'active']),
    ).rejects.toMatchObject({ code: '23505' });
    const invalid = randomUUID();
    await expect(
      database.pool.query(insert, [invalid, 'Invalid', 'invalid']),
    ).rejects.toMatchObject({ code: '23514' });
    expect(
      (
        await database.pool.query('SELECT id FROM restaurants WHERE id = $1', [
          id,
        ])
      ).rowCount,
    ).toBe(1);
    expect(
      (
        await database.pool.query('SELECT id FROM restaurants WHERE id = $1', [
          invalid,
        ])
      ).rowCount,
    ).toBe(0);
  });

  it('AC-004: rechaza una FK huérfana sin persistir la tarjeta', async () => {
    const id = randomUUID();
    await expect(
      database.pool.query(
        "INSERT INTO loyalty_cards (id, membership_id, qr_token_hash, status, created_at) VALUES ($1, $2, $3, 'active', now())",
        [id, randomUUID(), randomUUID()],
      ),
    ).rejects.toMatchObject({ code: '23503' });
    expect(
      (
        await database.pool.query(
          'SELECT id FROM loyalty_cards WHERE id = $1',
          [id],
        )
      ).rowCount,
    ).toBe(0);
  });

  it('AC-002/005: aísla suites y elimina únicamente su base, con limpieza idempotente', async () => {
    const sibling = await createTestDatabase();
    const control = new pg.Client({
      connectionString: validateTestDatabaseUrl(process.env.TEST_DATABASE_URL)
        .href,
    });
    try {
      await control.connect();
      const ownName = (
        await sibling.pool.query<{ name: string }>(
          'SELECT current_database() AS name',
        )
      ).rows[0]?.name;
      expect((await sibling.pool.query('SELECT id FROM users')).rowCount).toBe(
        0,
      );
      await sibling.cleanup();
      await sibling.cleanup();
      expect(
        (
          await control.query(
            'SELECT datname FROM pg_database WHERE datname = $1',
            [ownName],
          )
        ).rowCount,
      ).toBe(0);
      expect((await database.pool.query('SELECT 1')).rowCount).toBe(1);
    } finally {
      await sibling.cleanup();
      await control.end();
    }
  });
});
