import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  programPayload,
  purchasePayload,
  safeReturnTo,
} from '../../src/features/forms';

describe('contratos de formularios', () => {
  it('BR-013 envía una compra sin cantidad arbitraria de sellos', () => {
    expect(purchasePayload('card', 'location', ' VENTA-42 ')).toEqual({
      card_id: 'card',
      location_id: 'location',
      sale_reference: 'VENTA-42',
    });
  });
  it('BR-018 omite condiciones al editar un programa', () => {
    const input = {
      name: 'Negocio',
      description: '',
      stamps_required: 10,
      reward_description: 'Recompensa gratis',
      logo_url: '',
      background_color: '#FFFFFF',
      text_color: '#000000',
      card_message: '',
    };
    expect(programPayload(input, true)).not.toHaveProperty('stamps_required');
    expect(programPayload(input, true)).not.toHaveProperty(
      'reward_description',
    );
    expect(programPayload(input, false)).toMatchObject({
      stamps_required: 10,
      reward_description: 'Recompensa gratis',
      logo_url: null,
    });
  });
  it('evita redirecciones a sitios externos', () => {
    expect(safeReturnTo('//evil.test')).toBe('/app');
    expect(safeReturnTo('https://evil.test')).toBe('/app');
    expect(safeReturnTo('/join/negocio')).toBe('/join/negocio');
  });
  it('informa contraste de los colores de tarjeta', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBe(1);
  });
});
