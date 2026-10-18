import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import * as schema from '../../db/schema.js';

const model = JSON.parse(
  readFileSync(
    new URL('../../SistemaDeFidelizacion.json', import.meta.url),
    'utf8',
  ),
) as {
  tables: {
    id: string;
    name: string;
    fields: {
      id: string;
      name: string;
      type: string;
      size?: number;
      primary: boolean;
      notNull: boolean;
      unique: boolean;
      check: string;
    }[];
  }[];
  relationships: {
    name: string;
    startTableId: string;
    endTableId: string;
    startFieldId: string;
    endFieldId: string;
  }[];
};
// DB-002: normalización de las dos relaciones autorizadas; el JSON no se modifica.
for (const relationship of model.relationships) {
  if (relationship.name === 'fk_rewards_memberships') {
    const rewards = model.tables.find((table) => table.name === 'rewards');
    const field = rewards?.fields.find(
      (column) => column.name === 'membership_id',
    );
    assert(field);
    relationship.startFieldId = field.id;
  }
  if (relationship.name === 'fk_rewards_loyalty_ledger_entries') {
    [relationship.startTableId, relationship.endTableId] = [
      relationship.endTableId,
      relationship.startTableId,
    ];
    [relationship.startFieldId, relationship.endFieldId] = [
      relationship.endFieldId,
      relationship.startFieldId,
    ];
  }
}
const tables = Object.values(schema).map(getTableConfig);
const dialect = new PgDialect();

describe('ENV-001: fidelidad del esquema de configuración al modelo JSON', () => {
  it('conserva todas las tablas, columnas, tipos, nulabilidad y claves', () => {
    expect(tables.map((t) => t.name).sort()).toEqual(
      model.tables.map((t) => t.name).sort(),
    );
    for (const source of model.tables) {
      const table = tables.find((t) => t.name === source.name);
      assert(table);
      expect(table.columns.map((c) => c.name)).toEqual(
        source.fields.map((f) => f.name),
      );
      for (const field of source.fields) {
        const col = table.columns.find((c) => c.name === field.name);
        assert(col);
        const types: Record<string, string> = {
          UUID: 'uuid',
          VARCHAR: `varchar(${field.size})`,
          TEXT: 'text',
          INTEGER: 'integer',
          TIMESTAMPTZ: 'timestamp with time zone',
        };
        expect(col.getSQLType()).toBe(types[field.type]);
        expect(col.notNull).toBe(field.notNull);
        expect(col.primary).toBe(field.primary);
        expect(col.isUnique).toBe(field.unique);
      }
    }
  });
  it('conserva las 16 relaciones y sus acciones NO ACTION', () => {
    const fks = tables.flatMap((t) => t.foreignKeys);
    expect(fks).toHaveLength(model.relationships.length);
    for (const rel of model.relationships) {
      const fk = fks.find((f) => f.getName() === rel.name);
      assert(fk);
      const start = model.tables.find((t) => t.id === rel.startTableId);
      assert(start);
      const end = model.tables.find((t) => t.id === rel.endTableId);
      assert(end);
      expect(fk.reference().columns.map((c) => c.name)).toEqual([
        start.fields.find((f) => f.id === rel.startFieldId)?.name,
      ]);
      expect(getTableConfig(fk.reference().foreignTable).name).toBe(end.name);
      expect(fk.reference().foreignColumns.map((c) => c.name)).toEqual([
        end.fields.find((f) => f.id === rel.endFieldId)?.name,
      ]);
      expect(fk.onDelete).toBe('no action');
      expect(fk.onUpdate).toBe('no action');
    }
  });
  it('todas las FK referencian una clave primaria o única en PostgreSQL', () => {
    for (const table of tables) {
      for (const fk of table.foreignKeys) {
        const referenced = fk.reference().foreignColumns;
        expect(referenced).toHaveLength(1);
        expect(
          referenced.every((column) => column.primary || column.isUnique),
          fk.getName(),
        ).toBe(true);
      }
    }
  });
  it('conserva CHECKs válidos y excluye solo la errata documentada DB-001', () => {
    for (const source of model.tables) {
      const expected = source.fields
        .filter(
          (f) =>
            f.check && !(source.name === 'roles' && f.name === 'created_at'),
        )
        .map((f) => f.check.replace(/^CHECK\((.*)\)$/, '$1'));
      const table = tables.find((t) => t.name === source.name);
      assert(table);
      const actual = table.checks.map((c) => dialect.sqlToQuery(c.value).sql);
      expect(actual.sort()).toEqual(expected.sort());
    }
  });
});
