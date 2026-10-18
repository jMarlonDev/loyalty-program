import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  idempotent,
  lockActor,
  lockRestaurant,
  withTransaction,
} from '../../src/infrastructure/transactions.js';
import { createTestDatabase, type TestDatabase } from '../helpers/database.js';

describe('TX-001 PostgreSQL real', () => {
  let database: TestDatabase;
  const actorId = randomUUID();
  beforeAll(async () => {
    database = await createTestDatabase();
    await database.pool.query(
      "INSERT INTO users(id,full_name,status,created_at,updated_at) VALUES($1,'Actor','active',now(),now())",
      [actorId],
    );
    await database.pool.query('CREATE TABLE tx_effects(id uuid primary key)');
  });
  afterAll(async () => {
    await database?.cleanup();
  });
  it('AC-002 revierte efectos y libera conexión para posteriores transacciones', async () => {
    const id = randomUUID();
    await expect(
      withTransaction(database.pool, async (client) => {
        await client.query('INSERT INTO tx_effects(id) VALUES($1)', [id]);
        throw new Error('controlled failure');
      }),
    ).rejects.toThrow('controlled failure');
    expect(
      (await database.pool.query('SELECT * FROM tx_effects WHERE id=$1', [id]))
        .rowCount,
    ).toBe(0);
    expect(
      await withTransaction(
        database.pool,
        async (client) => (await client.query('SELECT 1 AS n')).rows[0].n,
      ),
    ).toBe(1);
  });
  it('AC-003 concurrencia devuelve un solo efecto y conflicto no modifica', async () => {
    const key = randomUUID();
    const command = {
      actorId,
      key,
      operation: 'test-effect',
      payload: { amount: 1 },
    };
    const execute = (payload: unknown) =>
      withTransaction(database.pool, async (client) => {
        await lockActor(client, actorId);
        return idempotent(client, { ...command, payload }, async () => {
          const id = randomUUID();
          await client.query('INSERT INTO tx_effects(id) VALUES($1)', [id]);
          return { id };
        });
      });
    const results = await Promise.all(
      Array.from({ length: 8 }, () => execute(command.payload)),
    );
    expect(new Set(results.map((row) => row.id)).size).toBe(1);
    expect(
      (await database.pool.query('SELECT id FROM tx_effects')).rowCount,
    ).toBe(1);
    await expect(execute({ amount: 2 })).rejects.toMatchObject({
      status: 409,
      code: 'IDEMPOTENCY_CONFLICT',
    });
    expect(
      (await database.pool.query('SELECT id FROM tx_effects')).rowCount,
    ).toBe(1);
    await database.pool.query(
      "UPDATE users SET status='suspended' WHERE id=$1",
      [actorId],
    );
    await expect(execute(command.payload)).rejects.toMatchObject({
      status: 403,
    });
  });
  it('AC-004 recursos inexistentes no cambian datos', async () => {
    await expect(
      withTransaction(database.pool, (client) =>
        lockRestaurant(client, randomUUID()),
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      withTransaction(database.pool, (client) =>
        lockActor(client, randomUUID()),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
});
