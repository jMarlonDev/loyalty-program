import { describe, expect, it } from 'vitest';
import { loadRuntimeConfig } from '../../src/server/config';

const environment = {
  DATABASE_URL: 'postgresql://local:local@localhost:5432/loyalty_dev',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'public-test-key',
  CARD_TOKEN_ENCRYPTION_KEY: 'a'.repeat(64),
  APP_ORIGIN: 'http://localhost:3000',
};

describe('STACK-001 configuración fullstack', () => {
  it('requiere origen explícito y no lo deduce de Host', () => {
    expect(() => loadRuntimeConfig({ ...environment, APP_ORIGIN: '' })).toThrow(
      'APP_ORIGIN',
    );
  });
  it.each([
    'https://example.com/path',
    'https://user:pass@example.com',
    'http://example.com',
    'https://example.com?next=x',
  ])('rechaza origen inseguro o no canónico %s', (origin) => {
    expect(() =>
      loadRuntimeConfig({ ...environment, APP_ORIGIN: origin }),
    ).toThrow('APP_ORIGIN');
  });
  it('acepta desarrollo loopback y producción HTTPS', () => {
    expect(loadRuntimeConfig(environment).origin).toBe('http://localhost:3000');
    expect(
      loadRuntimeConfig({
        ...environment,
        APP_ORIGIN: 'https://loyalty.example',
      }).origin,
    ).toBe('https://loyalty.example');
  });
});
