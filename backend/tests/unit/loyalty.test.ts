import { describe, expect, it } from 'vitest';
import {
  assertNotSelf,
  loyaltyUuid,
  rewardBatches,
  validateLoyaltyInput,
} from '../../src/domain/loyalty.js';

describe('LOYALTY-001: reglas puras de compras y beneficios', () => {
  it('AC-001 asigna compras por antigüedad y conserva excedentes', () => {
    expect(rewardBatches(['a', 'b', 'c', 'd', 'e'], 2)).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    expect(rewardBatches(['a'], 2)).toEqual([]);
  });
  it('AC-001 rechaza meta inválida sin bucle infinito', () => {
    expect(() => rewardBatches(['a'], 0)).toThrow();
  });
  it('AC-002 no acepta sellos/actor enviados por el cliente ni referencias vacías', () => {
    expect(() =>
      validateLoyaltyInput('purchase', {
        card_id: 'bad',
        location_id: 'bad',
        sale_reference: '  ',
        stamps_earned: 10,
      }),
    ).toThrow();
    expect(() => validateLoyaltyInput('reverse', { reason: '' })).toThrow();
  });
  it('AC-003 rechaza autoconcesión y autocanje', () => {
    expect(() => assertNotSelf('same', 'same')).toThrow();
    expect(() => assertNotSelf('staff', 'customer')).not.toThrow();
  });
  it('AC-005 exige versión entera y consentimiento explícito', () => {
    expect(() =>
      validateLoyaltyInput('consent', { benefits_version: 0, accepted: false }),
    ).toThrow();
    expect(() =>
      validateLoyaltyInput('consent', { benefits_version: -1, accepted: true }),
    ).toThrow();
    expect(
      validateLoyaltyInput('consent', { benefits_version: 0, accepted: true }),
    ).toEqual({ benefits_version: 0, accepted: true });
  });
  it('rechaza NUL en referencias y motivos antes de acceder a PostgreSQL', () => {
    expect(() =>
      validateLoyaltyInput('reverse', { reason: 'bad\u0000reason' }),
    ).toThrow();
    expect(() =>
      validateLoyaltyInput('purchase', {
        card_id: '00000000-0000-4000-8000-000000000001',
        location_id: '00000000-0000-4000-8000-000000000002',
        sale_reference: 'bad\u0000reference',
      }),
    ).toThrow();
  });
  it('AC-002 canonicalizes UUID routes and body without mutating input', () => {
    const upper = 'ABCDEF01-2345-4678-ABCD-0123456789AB';
    const body = { card_id: upper, location_id: upper, sale_reference: 'sale' };
    expect(loyaltyUuid(upper)).toBe(upper.toLowerCase());
    expect(validateLoyaltyInput('purchase', body)).toEqual({
      ...body,
      card_id: upper.toLowerCase(),
      location_id: upper.toLowerCase(),
    });
    expect(body.card_id).toBe(upper);
  });
  it.each([
    0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ])('AC-001 rejects invalid target %s', (target) => {
    expect(() => rewardBatches(['purchase'], target)).toThrow(
      expect.objectContaining({ code: 'INVALID_TARGET', status: 409 }),
    );
  });
  it.each([
    ['card_id', 'invalid'],
    ['location_id', 'invalid'],
    ['sale_reference', ''],
    ['sale_reference', ' '],
    ['sale_reference', ' leading'],
    ['sale_reference', 'trailing '],
    ['sale_reference', 'a'.repeat(101)],
    ['sale_reference', 123],
    ['stamps_earned', 5],
    ['actor_id', 'spoof'],
  ])(
    'AC-002 rejects invalid %s independently of all valid fields',
    (field, value) => {
      expect(() =>
        validateLoyaltyInput('purchase', {
          card_id: 'abcdef01-2345-4678-abcd-0123456789ab',
          location_id: 'abcdef01-2345-4678-abcd-0123456789ac',
          sale_reference: 'valid-reference',
          [field]: value,
        }),
      ).toThrow(
        expect.objectContaining({ code: 'INVALID_INPUT', status: 400 }),
      );
    },
  );
  it('AC-001/002 accepts boundaries and leaves purchase allocation inputs unchanged', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    expect(rewardBatches(ids, 1)).toEqual(ids.map((id) => [id]));
    expect(rewardBatches(ids, 5)).toEqual([ids]);
    const groups = rewardBatches(ids, 2);
    groups[0]?.push('new');
    expect(ids).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(
      validateLoyaltyInput('purchase', {
        card_id: 'abcdef01-2345-4678-abcd-0123456789ab',
        location_id: 'abcdef01-2345-4678-abcd-0123456789ac',
        sale_reference: 'a'.repeat(100),
      }).sale_reference,
    ).toHaveLength(100);
    expect(
      validateLoyaltyInput('reverse', { reason: 'a'.repeat(1000) }).reason,
    ).toHaveLength(1000);
    expect(() =>
      validateLoyaltyInput('reverse', { reason: 'a'.repeat(1001) }),
    ).toThrow();
  });
});
