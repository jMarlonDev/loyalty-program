import { describe, expect, it } from 'vitest';
import {
  commandFingerprint,
  requireIdempotencyKey,
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
