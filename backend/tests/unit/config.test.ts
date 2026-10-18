import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';

const validEnv = {
  DATABASE_URL: 'postgresql://local:fake@localhost:5432/loyalty_test',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'public-test-key',
  CARD_TOKEN_ENCRYPTION_KEY: 'ab'.repeat(32),
};

describe('CORE-001 AC-001 configuration', () => {
  it('reads explicit configuration and defaults to port 3000', () => {
    expect(loadConfig(validEnv)).toEqual({
      port: 3000,
      databaseUrl: validEnv.DATABASE_URL,
      supabaseUrl: validEnv.SUPABASE_URL,
      supabasePublishableKey: validEnv.SUPABASE_PUBLISHABLE_KEY,
      cardTokenEncryptionKey: validEnv.CARD_TOKEN_ENCRYPTION_KEY,
      corsOrigins: [],
    });
    expect(loadConfig({ ...validEnv, PORT: '8080' }).port).toBe(8080);
  });

  it('accepts legacy public anon key', () => {
    const { SUPABASE_PUBLISHABLE_KEY, ...env } = validEnv;
    expect(
      loadConfig({ ...env, SUPABASE_ANON_KEY: SUPABASE_PUBLISHABLE_KEY })
        .supabasePublishableKey,
    ).toBe(SUPABASE_PUBLISHABLE_KEY);
  });

  it.each(['0', '-1', '65536', '1.5', '3000abc', ''])(
    'rejects invalid port %s',
    (PORT) => {
      expect(() => loadConfig({ ...validEnv, PORT })).toThrow('PORT');
    },
  );

  it.each([
    'DATABASE_URL',
    'SUPABASE_URL',
    'SUPABASE_PUBLISHABLE_KEY',
    'CARD_TOKEN_ENCRYPTION_KEY',
  ])('rejects missing %s', (key) => {
    const env: NodeJS.ProcessEnv = { ...validEnv };
    delete env[key];
    expect(() => loadConfig(env)).toThrow(key);
  });

  it('rejects invalid database URL without exposing its value', () => {
    const secret = 'https://username:private-password@example.com';
    expect(() => loadConfig({ ...validEnv, DATABASE_URL: secret })).toThrow(
      'DATABASE_URL',
    );
    try {
      loadConfig({ ...validEnv, DATABASE_URL: secret });
    } catch (error) {
      expect(String(error)).not.toContain('private-password');
    }
  });

  it.each([
    'javascript:alert(1)',
    'https://user:password@example.com',
    'not-a-url',
    'http://example.com',
    'https://example.com/path',
    'https://example.com?key=secret',
  ])('rejects invalid Supabase URL', (SUPABASE_URL) => {
    expect(() => loadConfig({ ...validEnv, SUPABASE_URL })).toThrow(
      'SUPABASE_URL',
    );
  });
  it.each(['bad', 'a'.repeat(63), 'z'.repeat(64)])(
    'rejects invalid encryption key',
    (CARD_TOKEN_ENCRYPTION_KEY) => {
      expect(() =>
        loadConfig({ ...validEnv, CARD_TOKEN_ENCRYPTION_KEY }),
      ).toThrow('CARD_TOKEN_ENCRYPTION_KEY');
    },
  );
  it('validates explicit CORS origins', () => {
    expect(
      loadConfig({
        ...validEnv,
        CORS_ORIGINS: 'https://app.example.test,http://localhost:5173',
      }).corsOrigins,
    ).toEqual(['https://app.example.test', 'http://localhost:5173']);
    expect(() => loadConfig({ ...validEnv, CORS_ORIGINS: '*' })).toThrow(
      'CORS_ORIGINS',
    );
    expect(() =>
      loadConfig({
        ...validEnv,
        CORS_ORIGINS: 'https://app.example.test/path',
      }),
    ).toThrow('CORS_ORIGINS');
  });
});
