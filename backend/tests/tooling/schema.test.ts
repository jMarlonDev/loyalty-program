import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import * as schema from '../../db/schema.js';

type OriginalModel = {
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
const modelPath = new URL('../../SistemaDeFidelizacion.json', import.meta.url);
// DB-003: si el JSON externo no está disponible, contrastar el snapshot histórico
// versionado sin reconstruir ni afirmar la disponibilidad del modelo original.
const originalAvailable = existsSync(modelPath);
const snapshot = JSON.parse(
  readFileSync(
    new URL('../../drizzle/meta/0000_snapshot.json', import.meta.url),
    'utf8',
  ),
) as {
  tables: Record<
    string,
    {
      name: string;
      columns: Record<
        string,
        { name: string; type: string; primaryKey: boolean; notNull: boolean }
      >;
      uniqueConstraints: Record<string, { columns: string[] }>;
      checkConstraints: Record<string, { value: string }>;
      foreignKeys: Record<
        string,
        {
          name: string;
          tableFrom: string;
          tableTo: string;
          columnsFrom: string[];
          columnsTo: string[];
        }
      >;
    }
  >;
};
const model: OriginalModel = originalAvailable
  ? JSON.parse(readFileSync(modelPath, 'utf8'))
  : {
      tables: Object.values(snapshot.tables).map((table) => ({
        id: table.name,
        name: table.name,
        fields: Object.values(table.columns).map((column) => ({
          id: `${table.name}.${column.name}`,
          name: column.name,
          type: column.type,
          primary: column.primaryKey,
          notNull: column.notNull,
          unique: Object.values(table.uniqueConstraints).some(
            (constraint) =>
              constraint.columns.length === 1 &&
              constraint.columns[0] === column.name,
          ),
          check: '',
        })),
      })),
      relationships: Object.values(snapshot.tables).flatMap((table) =>
        Object.values(table.foreignKeys).map((fk) => ({
          name: fk.name,
          startTableId: fk.tableFrom,
          endTableId: fk.tableTo,
          startFieldId: `${fk.tableFrom}.${fk.columnsFrom[0]}`,
          endFieldId: `${fk.tableTo}.${fk.columnsTo[0]}`,
        })),
      ),
    };
// DB-002: normalización de las dos relaciones autorizadas; el JSON no se modifica.
for (const relationship of originalAvailable ? model.relationships : []) {
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

describe(`ENV-001/DB-003: fidelidad al ${originalAvailable ? 'modelo JSON' : 'snapshot inicial versionado'}`, () => {
  it('conserva todas las tablas, columnas, tipos, nulabilidad y claves', () => {
    expect(tables.map((t) => t.name).sort()).toEqual(
      expect.arrayContaining(model.tables.map((t) => t.name)),
    );
    for (const source of model.tables) {
      const table = tables.find((t) => t.name === source.name);
      assert(table);
      expect(table.columns.map((c) => c.name)).toEqual(
        expect.arrayContaining(source.fields.map((f) => f.name)),
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
        expect(col.getSQLType()).toBe(
          originalAvailable ? types[field.type] : field.type,
        );
        expect(col.notNull).toBe(field.notNull);
        expect(col.primary).toBe(field.primary);
        expect(col.isUnique).toBe(field.unique);
      }
    }
  });
  it('conserva las 16 relaciones y sus acciones NO ACTION', () => {
    const fks = tables.flatMap((t) => t.foreignKeys);
    expect(fks.length).toBeGreaterThanOrEqual(model.relationships.length);
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
        const target = getTableConfig(fk.reference().foreignTable);
        const compositeUnique = target.uniqueConstraints.some(
          (constraint) =>
            constraint.columns.length === referenced.length &&
            constraint.columns.every(
              (column, index) => column.name === referenced[index]?.name,
            ),
        );
        expect(
          compositeUnique ||
            (referenced.length === 1 &&
              referenced.every((column) => column.primary || column.isUnique)),
          fk.getName(),
        ).toBe(true);
      }
    }
  });
  it('conserva CHECKs válidos y excluye solo la errata documentada DB-001', () => {
    for (const source of model.tables) {
      const expected = originalAvailable
        ? source.fields
            .filter(
              (f) =>
                f.check &&
                !(source.name === 'roles' && f.name === 'created_at'),
            )
            .map((f) => f.check.replace(/^CHECK\((.*)\)$/, '$1'))
        : Object.values(
            snapshot.tables[`public.${source.name}`]?.checkConstraints ?? {},
          ).map((check) => check.value);
      const table = tables.find((t) => t.name === source.name);
      assert(table);
      const actual = table.checks.map((c) => dialect.sqlToQuery(c.value).sql);
      expect(actual).toEqual(expect.arrayContaining(expected));
    }
  });
});
