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
  it.each(['192.168.33.9', '10.0.0.2', '172.16.0.1', '172.31.255.254'])(
    'MOBILE-001 AC-005 permite HTTP LAN solo en desarrollo: %s',
    (host) => {
      const config = { ...environment, APP_ORIGIN: `http://${host}:3000` };
      expect(
        loadRuntimeConfig({ ...config, NODE_ENV: 'development' }).origin,
      ).toBe(config.APP_ORIGIN);
      for (const mode of ['production', 'test', undefined])
        expect(() => loadRuntimeConfig({ ...config, NODE_ENV: mode })).toThrow(
          'APP_ORIGIN',
        );
    },
  );
  it.each([
    '172.15.0.1',
    '172.32.0.1',
    '192.169.1.1',
    '8.8.8.8',
    '0.0.0.0',
    'private.example',
    '10.example.com',
    '192.168.example.com',
    '172.16.example.com',
  ])(
    'MOBILE-001 AC-005 rechaza HTTP fuera de RFC1918 incluso en desarrollo: %s',
    (host) => {
      expect(() =>
        loadRuntimeConfig({
          ...environment,
          NODE_ENV: 'development',
          APP_ORIGIN: `http://${host}:3000`,
        }),
      ).toThrow('APP_ORIGIN');
    },
  );
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
