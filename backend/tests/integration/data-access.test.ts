import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../helpers/database.js';

describe('DB-004 acceso directo sin políticas', () => {
  let database: TestDatabase;
  beforeAll(async () => {
    database = await createTestDatabase();
  });
  afterAll(async () => {
    await database?.cleanup();
  });
  it('habilita RLS en todas las tablas de negocio', async () => {
    const rows = (
      await database.pool.query(
        "SELECT relname,relrowsecurity FROM pg_class JOIN pg_namespace n ON n.oid=relnamespace WHERE n.nspname='public' AND relkind='r'",
      )
    ).rows;
    expect(rows).toHaveLength(16);
    expect(rows.filter((row) => !row.relrowsecurity)).toEqual([]);
  });
  it('rol ordinario no lee perfiles ni los escribe; propietario sí', async () => {
    const role = `test_reader_${randomUUID().replaceAll('-', '')}`;
    const client = await database.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`CREATE ROLE "${role}" NOLOGIN`);
      await client.query(`GRANT USAGE ON SCHEMA public TO "${role}"`);
      await client.query(`GRANT SELECT,INSERT ON users TO "${role}"`);
      await client.query(
        "INSERT INTO users(id,full_name,status,created_at,updated_at) VALUES($1,'Hidden','active',now(),now())",
        [randomUUID()],
      );
      await client.query(`SET LOCAL ROLE "${role}"`);
      expect((await client.query('SELECT id FROM users')).rowCount).toBe(0);
      await expect(
        client.query(
          "INSERT INTO users(id,full_name,status,created_at,updated_at) VALUES($1,'Forbidden','active',now(),now())",
          [randomUUID()],
        ),
      ).rejects.toMatchObject({ code: '42501' });
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});
