import { describe, expect, it } from 'vitest';
import {
  assertNotSelf,
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
});
