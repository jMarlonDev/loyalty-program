import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import {
  commandFingerprint,
  requireIdempotencyKey,
  withTransaction,
} from '../../src/infrastructure/transactions.js';

describe('TX-001 AC-001 comandos idempotentes', () => {
  it('ignora orden de propiedades de objetos anidados', () => {
    expect(commandFingerprint('buy', { x: { a: 1, b: 2 }, y: 3 })).toBe(
      commandFingerprint('buy', { y: 3, x: { b: 2, a: 1 } }),
    );
  });
  it('distingue operación, contenido y orden de arrays', () => {
    const first = commandFingerprint('buy', { list: [1, 2] });
    expect(commandFingerprint('redeem', { list: [1, 2] })).not.toBe(first);
    expect(commandFingerprint('buy', { list: [2, 1] })).not.toBe(first);
    expect(commandFingerprint('buy', { list: [1, 3] })).not.toBe(first);
  });
  it.each([undefined, '', ' ', 'a b', 'a\nb', 'a'.repeat(256), 'ñ'])(
    'rechaza clave inválida %s',
    (key) => {
      expect(() => requireIdempotencyKey(key)).toThrow();
    },
  );
  it('conserva clave válida', () => {
    expect(requireIdempotencyKey('purchase-001')).toBe('purchase-001');
  });
});

// Los dobles aquí simulan fallos de transporte que no pueden provocarse de
// manera determinista mediante SQL; la atomicidad se prueba con PostgreSQL.
describe('TX-001 AC-002 fallos de conexión', () => {
  it('conserva error original y descarta conexión si falla ROLLBACK', async () => {
    const failure = new Error('original command failure');
    const rollbackFailure = new Error('connection lost');
    const { pool, query, release } = transactionFixture(rollbackFailure);
    await expect(
      withTransaction(pool, async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(query.mock.calls.map(([sql]) => sql)).toEqual(['BEGIN', 'ROLLBACK']);
    expect(release).toHaveBeenCalledExactlyOnceWith(rollbackFailure);
  });

  it('traduce unicidad sin filtrar SQL incluso si rollback pierde conexión', async () => {
    const { pool, release } = transactionFixture(new Error('connection lost'));
    await expect(
      withTransaction(pool, async () => {
        throw Object.assign(new Error('secret SQL values'), { code: '23505' });
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: 'CONFLICT',
      message: 'El registro ya existe.',
    });
    expect(release).toHaveBeenCalledOnce();
  });

  it('libera conexión sana tras rollback satisfactorio y conserva el error', async () => {
    const failure = new Error('command rejected');
    const { pool, query, release } = transactionFixture();
    await expect(
      withTransaction(pool, async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(query.mock.calls.map(([sql]) => sql)).toEqual(['BEGIN', 'ROLLBACK']);
    expect(release).toHaveBeenCalledOnce();
    expect(release.mock.calls[0]?.[0]).toBeUndefined();
  });
});

function transactionFixture(rollbackFailure?: Error) {
  const query = vi.fn(async (sql: string) => {
    if (sql === 'ROLLBACK' && rollbackFailure) throw rollbackFailure;
    return { rows: [] };
  });
  const release = vi.fn<(error?: Error) => void>();
  const pool = {
    connect: vi.fn(async () => ({ query, release })),
  } as unknown as Pool;
  return { pool, query, release };
}
