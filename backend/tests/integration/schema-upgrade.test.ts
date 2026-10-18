import { randomUUID } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../helpers/database.js';

async function initialDatabase() {
  const directory = await mkdtemp(join(tmpdir(), 'loyalty-initial-'));
  const database = await createTestDatabase({ migrate: false });
  try {
    await mkdir(join(directory, 'meta'));
    const source = fileURLToPath(new URL('../../drizzle/', import.meta.url));
    const journal = JSON.parse(
      await readFile(join(source, 'meta/_journal.json'), 'utf8'),
    );
    journal.entries = journal.entries.slice(0, 1);
    await writeFile(
      join(directory, 'meta/_journal.json'),
      JSON.stringify(journal),
    );
    await cp(
      join(source, '0000_initial.sql'),
      join(directory, '0000_initial.sql'),
    );
    await migrate(database.db, { migrationsFolder: directory });
    return database;
  } catch (error) {
    await database.cleanup();
    throw error;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function legacyFixtures(database: TestDatabase) {
  const userId = randomUUID();
  const restaurantId = randomUUID();
  const programId = randomUUID();
  const membershipId = randomUUID();
  await database.pool.query(
    "INSERT INTO users (id,full_name,status,created_at,updated_at) VALUES ($1,'Legacy','active',now(),now())",
    [userId],
  );
  await database.pool.query(
    "INSERT INTO restaurants (id,name,slug,status,created_at,updated_at) VALUES ($1,'Legacy',$2,'active',now(),now())",
    [restaurantId, randomUUID()],
  );
  await database.pool.query(
    "INSERT INTO loyalty_programs (id,restaurant_id,name,public_code,stamps_required,reward_description,status,created_at,updated_at) VALUES ($1,$2,'Legacy',$3,3,'Reward','active',now(),now())",
    [programId, restaurantId, randomUUID()],
  );
  await database.pool.query(
    "INSERT INTO memberships (id,user_id,program_id,status,joined_at) VALUES ($1,$2,$3,'active',now())",
    [membershipId, userId, programId],
  );
  return { userId, restaurantId, programId, membershipId };
}

describe('DB-003 / BACKEND-001 AC-016: upgrade histórico', () => {
  it('bloquea contabilidad histórica sin clasificación sin borrar datos ni aplicar upgrade parcial', async () => {
    const database = await initialDatabase();
    try {
      const fixture = await legacyFixtures(database);
      await database.pool.query(
        'INSERT INTO loyalty_ledger_entries(id,membership_id,stamp_delta,created_at) VALUES($1,$2,1,now())',
        [randomUUID(), fixture.membershipId],
      );
      await expect(database.migrate()).rejects.toThrow();
      expect(
        (
          await database.pool.query(
            'SELECT stamp_delta FROM loyalty_ledger_entries',
          )
        ).rows,
      ).toEqual([{ stamp_delta: 1 }]);
      expect(
        (
          await database.pool.query(
            'SELECT * FROM drizzle.__drizzle_migrations',
          )
        ).rowCount,
      ).toBe(1);
    } finally {
      await database.cleanup();
    }
  });
  it('preserva datos iniciales y bloquea términos con participación histórica', async () => {
    const database = await initialDatabase();
    try {
      const fixture = await legacyFixtures(database);
      await database.pool.query(
        "UPDATE memberships SET status='closed' WHERE id=$1",
        [fixture.membershipId],
      );
      await database.migrate();
      expect(
        (
          await database.pool.query('SELECT full_name FROM users WHERE id=$1', [
            fixture.userId,
          ])
        ).rows[0],
      ).toEqual({ full_name: 'Legacy' });
      expect(
        (
          await database.pool.query(
            'SELECT terms_locked FROM loyalty_programs WHERE id=$1',
            [fixture.programId],
          )
        ).rows[0],
      ).toEqual({ terms_locked: true });
      expect(
        (
          await database.pool.query(
            'SELECT benefits_version FROM memberships WHERE id=$1',
            [fixture.membershipId],
          )
        ).rows[0],
      ).toEqual({ benefits_version: 0 });
      expect(
        (
          await database.pool.query(
            'SELECT * FROM drizzle.__drizzle_migrations',
          )
        ).rowCount,
      ).toBe(4);
      await database.pool.query(
        "INSERT INTO memberships (id,user_id,program_id,status,joined_at) VALUES ($1,$2,$3,'active',now())",
        [randomUUID(), fixture.userId, fixture.programId],
      );
      await expect(
        database.pool.query(
          "INSERT INTO memberships (id,user_id,program_id,status,joined_at) VALUES ($1,$2,$3,'suspended',now())",
          [randomUUID(), fixture.userId, fixture.programId],
        ),
      ).rejects.toMatchObject({ code: '23505' });
    } finally {
      await database.cleanup();
    }
  });

  it('bloquea duplicados históricos sin eliminar datos ni registrar upgrade parcial', async () => {
    const database = await initialDatabase();
    try {
      const fixture = await legacyFixtures(database);
      await database.pool.query(
        "INSERT INTO memberships (id,user_id,program_id,status,joined_at) VALUES ($1,$2,$3,'active',now())",
        [randomUUID(), fixture.userId, fixture.programId],
      );
      await expect(database.migrate()).rejects.toMatchObject({
        cause: { code: '23505' },
      });
      expect(
        (await database.pool.query('SELECT id FROM memberships')).rowCount,
      ).toBe(2);
      expect(
        (
          await database.pool.query(
            'SELECT * FROM drizzle.__drizzle_migrations',
          )
        ).rowCount,
      ).toBe(1);
      expect(
        (
          await database.pool.query(
            "SELECT column_name FROM information_schema.columns WHERE table_name='memberships' AND column_name='benefits_version'",
          )
        ).rowCount,
      ).toBe(0);
    } finally {
      await database.cleanup();
    }
  });

  it('rechaza movimientos ligados a premios de otra membresía', async () => {
    const database = await createTestDatabase();
    try {
      const first = await legacyFixtures(database);
      const second = await legacyFixtures(database);
      const rewardId = randomUUID();
      await database.pool.query(
        "INSERT INTO rewards (id,membership_id,description,stamps_spent,status,earned_at) VALUES ($1,$2,'Reward',3,'available',now())",
        [rewardId, first.membershipId],
      );
      await expect(
        database.pool.query(
          'INSERT INTO loyalty_ledger_entries (id,membership_id,reward_id,stamp_delta,created_at) VALUES ($1,$2,$3,-3,now())',
          [randomUUID(), second.membershipId, rewardId],
        ),
      ).rejects.toMatchObject({ code: '23503' });
      expect(
        (await database.pool.query('SELECT id FROM loyalty_ledger_entries'))
          .rowCount,
      ).toBe(0);
    } finally {
      await database.cleanup();
    }
  });
});
