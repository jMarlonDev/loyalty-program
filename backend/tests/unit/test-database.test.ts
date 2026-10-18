import { describe, expect, it } from 'vitest';
import { validateTestDatabaseUrl } from '../helpers/database.js';

const local = 'postgresql://test:test@127.0.0.1:55432/loyalty_test_control';

describe('TESTDB-001 AC-001: configuración aislada', () => {
  it.each([
    undefined,
    '',
    'not-a-url',
    'https://localhost/loyalty_test_control',
    'postgresql://test:test@db.example.com/loyalty_test_control',
    'postgresql://test:test@127.0.0.1/development',
    `${local}?host=db.example.com`,
    `${local}#fragment`,
  ])('rechaza configuración insegura sin revelar el valor: %s', (value) => {
    expect(() => validateTestDatabaseUrl(value)).toThrow(/TEST_DATABASE_URL/);
  });

  it('rechaza el mismo destino de desarrollo incluso con otras credenciales', () => {
    expect(() => validateTestDatabaseUrl(local, local)).toThrow(/DATABASE_URL/);
    expect(() =>
      validateTestDatabaseUrl(
        local,
        local.replace('test:test@', 'other:secret@'),
      ),
    ).toThrow(/DATABASE_URL/);
  });

  it('acepta PostgreSQL local explícito y una base identificada para pruebas', () => {
    expect(validateTestDatabaseUrl(local).pathname).toBe(
      '/loyalty_test_control',
    );
    expect(
      validateTestDatabaseUrl(local.replace('127.0.0.1', 'localhost')).hostname,
    ).toBe('localhost');
  });
});
