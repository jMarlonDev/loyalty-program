import { describe, expect, it } from 'vitest';
import {
  parsePage,
  parseProgramInput,
  requireEmptyBody,
  requireUuid,
} from '../../src/domain/programs.js';

const valid = {
  name: ' Café ',
  stamps_required: 5,
  reward_description: 'Café gratis',
};
describe('PROGRAMS-001 inputs', () => {
  it('AC-001 trims names and supplies design defaults', () => {
    expect(parseProgramInput(valid, true)).toMatchObject({
      name: 'Café',
      stamps_required: 5,
      background_color: '#FFFFFF',
      text_color: '#000000',
    });
  });
  it.each([
    null,
    [],
    {},
    { ...valid, stamps_required: 0 },
    { ...valid, stamps_required: 1.5 },
    { ...valid, stamps_required: 2147483648 },
    { ...valid, logo_url: 'http://unsafe.test' },
    { ...valid, background_color: 'red' },
    { ...valid, card_message: 'a'.repeat(161) },
    { ...valid, role: 'owner' },
    { ...valid, status: 'paused' },
  ])('AC-001 rejects invalid creation %j', (body) => {
    expect(() => parseProgramInput(body, true)).toThrow();
  });
  it('AC-001 validates sparse patch preserving explicit nullable fields', () => {
    expect(
      parseProgramInput({ logo_url: null, status: 'ended' }, false),
    ).toEqual({ logo_url: null, status: 'ended' });
  });
  it.each([
    {},
    { status: 'other' },
    { status: ['active'] },
    { stamps_required: 0 },
    { name: '' },
  ])('AC-001 rejects invalid patch %j', (body) =>
    expect(() => parseProgramInput(body, false)).toThrow(),
  );
  it('AC-004 parses bounded pagination', () => {
    expect(parsePage({ limit: '100' })).toEqual({ cursor: null, limit: 100 });
  });
  it.each([
    { limit: '0' },
    { limit: '101' },
    { limit: '1.5' },
    { cursor: 'unsafe' },
  ])('AC-004 rejects malformed pagination %j', (body) =>
    expect(() => parsePage(body)).toThrow(),
  );
  it('AC-001 rejects invalid route identifiers and command fields', () => {
    expect(() => requireUuid('bad')).toThrow();
    expect(() => requireEmptyBody({ actor_id: 'bad' })).toThrow();
  });
  it('AC-001/004 canonicalizes equivalent UUID routes and cursors', () => {
    const upper = 'ABCDEF01-2345-4678-ABCD-0123456789AB';
    expect(requireUuid(upper)).toBe(upper.toLowerCase());
    expect(parsePage({ cursor: upper }).cursor).toBe(upper.toLowerCase());
  });
});
