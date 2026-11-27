import { describe, expect, it, vi } from 'vitest';
import {
  collectTransitionReport,
  validateTransitionDatabaseUrl,
} from '../../scripts/transition-report.js';

describe('DATA-NEXT-001: informe de transición aislado', () => {
  it.each([
    'postgresql://operator:private@127.0.0.1:5432/loyalty_copy_october',
    'postgres://operator:private@localhost/loyalty_test_fixture',
  ])('AC-001 acepta una copia local explícita', (value) => {
    expect(validateTransitionDatabaseUrl(value).href).toBe(value);
  });

  it.each([
    undefined,
    '',
    'postgresql://operator:private@db.example.com/loyalty_copy_fixture',
    'postgresql://operator:private@127.0.0.1/production',
    'https://operator:private@127.0.0.1/loyalty_copy_fixture',
    'postgresql://operator:private@127.0.0.1/loyalty_copy_fixture?sslmode=require',
    'postgresql://operator:private@127.0.0.1/loyalty_copy_fixture#private',
    'postgresql://operator:private@127.0.0.1/loyalty_copy_',
  ])(
    'AC-001 rechaza destinos fuera de alcance sin revelar secretos',
    (value) => {
      expect(() => validateTransitionDatabaseUrl(value)).toThrow(
        /^TRANSITION_DATABASE_URL requiere una copia PostgreSQL local\.$/,
      );
    },
  );

  it('AC-004 hace rollback de una lectura fallida sobre una fotografía read-only', async () => {
    const failure = new Error('failed query');
    const connection = {
      query: vi.fn(async (query: string) => {
        if (query.includes('information_schema')) throw failure;
        return { rows: [] };
      }),
    };
    await expect(collectTransitionReport(connection)).rejects.toBe(failure);
    expect(connection.query.mock.calls[0]?.[0]).toBe(
      'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY',
    );
    expect(connection.query.mock.lastCall?.[0]).toBe('ROLLBACK');
  });

  it('AC-005 rechaza esquema nuevo para no interpretar premios nuevos como heredados', async () => {
    const connection = {
      query: vi.fn(async (query: string) => ({
        rows: query.includes('information_schema')
          ? [{ table_name: 'rewards', column_name: 'accounting_mode' }]
          : [],
      })),
    };
    await expect(collectTransitionReport(connection)).rejects.toThrow(
      'El informe requiere una copia del esquema 0004.',
    );
    expect(connection.query.mock.lastCall?.[0]).toBe('ROLLBACK');
  });
});
