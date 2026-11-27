import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { createTestDatabase } from '../helpers/database.js';
import {
  fixture,
  snapshot,
  sourceDatabase,
} from '../helpers/transition-fixture.js';

async function restore(container: string, database: string, backup: Buffer) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      'docker',
      [
        'exec',
        '-i',
        container,
        'pg_restore',
        '-U',
        'loyalty_test',
        '--exit-on-error',
        '-d',
        database,
      ],
      { stdio: ['pipe', 'ignore', 'ignore'] },
    );
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0
        ? resolve()
        : reject(new Error('Falló la restauración temporal.')),
    );
    child.stdin.on('error', reject);
    child.stdin.end(backup);
  });
}

describe('NEXT-005 / DB-006: upgrade técnico desde 0004', () => {
  it('AC-001/002 conserva identidades, roles, QR, compras y premio debitado con excedente', async () => {
    const database = await sourceDatabase();
    try {
      const ids = await fixture(database);
      const before = await snapshot(database);
      await database.migrate();
      await database.migrate();
      const after = await snapshot(database);
      const additive: Record<string, string[]> = {
        restaurants: ['owner_user_id'],
        loyalty_cards: ['version'],
        rewards: ['accounting_mode', 'cycle_id'],
        restaurant_employees: ['phone', 'can_transfer_cards'],
        memberships: [
          'is_reenrollment',
          'previous_cards_count',
          'close_reason',
        ],
      };
      for (const table of [
        'card_events_outbox',
        'customers',
        'customer_sessions',
        'operator_invitations',
        'loyalty_cycles',
        'reward_vouchers',
        'reward_deliveries',
        'customer_event_leases',
        'card_transfers',
        'enrollment_attempts',
      ]) {
        expect(after[table]).toEqual([]);
        delete after[table];
      }
      for (const [table, columns] of Object.entries(additive)) {
        for (const row of after[table] as Record<string, unknown>[]) {
          for (const column of columns) delete row[column];
        }
      }
      expect(after).toEqual(before);
      expect(
        (
          await database.pool.query(
            'SELECT owner_user_id FROM restaurants WHERE id=$1',
            [ids.restaurant],
          )
        ).rows,
      ).toEqual([{ owner_user_id: null }]);
      expect(
        (
          await database.pool.query(
            'SELECT accounting_mode FROM rewards WHERE id=$1',
            [ids.reward],
          )
        ).rows,
      ).toEqual([{ accounting_mode: 'legacy_debited' }]);
      expect(
        (
          await database.pool.query(
            'SELECT version FROM loyalty_cards WHERE id=$1',
            [ids.card],
          )
        ).rows,
      ).toEqual([{ version: 0 }]);
      expect(
        (
          await database.pool.query(
            'SELECT sum(stamp_delta)::int AS balance FROM loyalty_ledger_entries WHERE membership_id=$1',
            [ids.membership],
          )
        ).rows,
      ).toEqual([{ balance: 1 }]);
      expect(
        (
          await database.pool.query(
            'SELECT * FROM drizzle.__drizzle_migrations',
          )
        ).rowCount,
      ).toBe(8);
    } finally {
      await database.cleanup();
    }
  });

  it('AC-003 bloquea premio sin débito y revierte toda la migración sin reparar datos', async () => {
    const database = await sourceDatabase();
    try {
      const ids = await fixture(database);
      await database.pool.query(
        'DELETE FROM loyalty_ledger_entries WHERE reward_id=$1',
        [ids.reward],
      );
      const before = await snapshot(database);
      await expect(database.migrate()).rejects.toThrow();
      expect(await snapshot(database)).toEqual(before);
      expect(
        (
          await database.pool.query(
            'SELECT * FROM drizzle.__drizzle_migrations',
          )
        ).rowCount,
      ).toBe(5);
      expect(
        (
          await database.pool.query(
            "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND column_name='accounting_mode'",
          )
        ).rowCount,
      ).toBe(0);
    } finally {
      await database.cleanup();
    }
  });

  it('AC-004 revierte evento y versión juntos y protege duplicados concurrentes', async () => {
    const database = await sourceDatabase();
    try {
      const ids = await fixture(database);
      await database.migrate();
      const client = await database.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          'UPDATE loyalty_cards SET version=version+1 WHERE id=$1',
          [ids.card],
        );
        await client.query(
          "INSERT INTO card_events_outbox(id,card_id,version,type,occurred_at,available_at) VALUES($1,$2,1,'card.changed',now(),now())",
          [randomUUID(), ids.card],
        );
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
      expect(
        (await database.pool.query('SELECT * FROM card_events_outbox'))
          .rowCount,
      ).toBe(0);
      expect(
        (
          await database.pool.query(
            'SELECT version FROM loyalty_cards WHERE id=$1',
            [ids.card],
          )
        ).rows,
      ).toEqual([{ version: 0 }]);
      const inserted = await Promise.allSettled(
        [0, 1].map(() =>
          database.pool.query(
            "INSERT INTO card_events_outbox(id,card_id,version,type,occurred_at,available_at) VALUES($1,$2,1,'card.changed',now(),now())",
            [randomUUID(), ids.card],
          ),
        ),
      );
      expect(
        inserted.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        inserted.find((result) => result.status === 'rejected'),
      ).toMatchObject({ reason: { code: '23505' } });
      expect(
        (await database.pool.query('SELECT * FROM card_events_outbox'))
          .rowCount,
      ).toBe(1);
    } finally {
      await database.cleanup();
    }
  });

  it('AC-005 restaura un backup pg_dump 0004 en otra base aislada y permite reintentar upgrade', async () => {
    const container = process.env.TEST_DATABASE_CONTAINER;
    if (!container || !/^loyalty-test-[a-f0-9]{12}$/.test(container)) {
      throw new Error(
        'El ensayo de restauración requiere npm run test:db con su contenedor exclusivo.',
      );
    }
    const database = await sourceDatabase();
    const restored = await createTestDatabase({ migrate: false });
    try {
      const ids = await fixture(database);
      const before = await snapshot(database);
      const sourceName = (
        await database.pool.query('SELECT current_database() AS name')
      ).rows[0].name as string;
      const targetName = (
        await restored.pool.query('SELECT current_database() AS name')
      ).rows[0].name as string;
      if (
        ![sourceName, targetName].every((name) =>
          /^loyalty_test_[a-f0-9]{32}$/.test(name),
        ) ||
        sourceName === targetName
      ) {
        throw new Error(
          'El backup/restore requiere dos bases exclusivas diferentes.',
        );
      }
      const backup = await promisify(execFile)(
        'docker',
        ['exec', container, 'pg_dump', '-U', 'loyalty_test', '-Fc', sourceName],
        { encoding: 'buffer', maxBuffer: 8 * 1024 * 1024 },
      );
      await database.migrate();
      await restore(container, targetName, backup.stdout);
      expect(await snapshot(restored)).toEqual(before);
      expect(
        (
          await restored.pool.query(
            'SELECT * FROM drizzle.__drizzle_migrations',
          )
        ).rowCount,
      ).toBe(5);
      await restored.migrate();
      expect(
        (
          await restored.pool.query(
            'SELECT * FROM drizzle.__drizzle_migrations',
          )
        ).rowCount,
      ).toBe(8);
      expect(
        (
          await restored.pool.query(
            'SELECT accounting_mode FROM rewards WHERE id=$1',
            [ids.reward],
          )
        ).rows,
      ).toEqual([{ accounting_mode: 'legacy_debited' }]);
    } finally {
      await Promise.all([database.cleanup(), restored.cleanup()]);
    }
  });
});
