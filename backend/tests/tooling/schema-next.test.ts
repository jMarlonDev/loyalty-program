import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import * as schema from '../../db/schema.js';

const tables = Object.values(schema).map(getTableConfig);
const dialect = new PgDialect();

describe('NEXT-005 / DB-006: expansión técnica aditiva', () => {
  it('AC-001 conserva identidad heredada y añade propiedad nullable sin conceder acceso', () => {
    const restaurants = tables.find((table) => table.name === 'restaurants');
    const owner = restaurants?.columns.find(
      (column) => column.name === 'owner_user_id',
    );
    expect(owner).toBeDefined();
    expect(owner?.notNull).toBe(false);
    expect(owner?.hasDefault).toBe(false);
    expect(tables.find((table) => table.name === 'roles')).toBeDefined();
    expect(
      tables
        .find((table) => table.name === 'memberships')
        ?.columns.find((column) => column.name === 'user_id')?.notNull,
    ).toBe(true);
  });

  it('AC-001/003 distingue contabilidad y añade versión con defaults compatibles explícitos', () => {
    const rewards = tables.find((table) => table.name === 'rewards');
    expect(
      rewards?.columns.find((column) => column.name === 'accounting_mode'),
    ).toMatchObject({ notNull: true, default: 'legacy_debited' });
    expect(
      rewards?.checks.map(
        (constraint) => dialect.sqlToQuery(constraint.value).sql,
      ),
    ).toContain("accounting_mode IN ('legacy_debited', 'debit_on_redemption')");
    expect(
      tables
        .find((table) => table.name === 'loyalty_cards')
        ?.columns.find((column) => column.name === 'version'),
    ).toMatchObject({ notNull: true, default: 0 });
  });

  it('AC-004 persiste un evento privado por tarjeta/versión y lease sin datos personales', () => {
    const outbox = tables.find((table) => table.name === 'card_events_outbox');
    expect(outbox).toBeDefined();
    expect(outbox?.enableRLS).toBe(true);
    expect(outbox?.columns.map((column) => column.name)).toEqual([
      'id',
      'card_id',
      'version',
      'type',
      'occurred_at',
      'available_at',
      'attempts',
      'lease_token',
      'lease_until',
      'published_at',
    ]);
    expect(
      outbox?.uniqueConstraints.map((constraint) =>
        constraint.columns.map((column) => column.name),
      ),
    ).toContainEqual(['card_id', 'version']);
    expect(outbox?.indexes.map((index) => index.config.name)).toContain(
      'card_events_outbox_pending_idx',
    );
  });
});
