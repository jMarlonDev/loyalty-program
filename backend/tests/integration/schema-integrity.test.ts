import { randomUUID } from 'node:crypto';
import { getTableConfig } from 'drizzle-orm/pg-core';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../../db/schema.js';
import {
  createTestDatabase,
  type TestDatabase,
  validateTestDatabaseUrl,
} from '../helpers/database.js';

const tables = Object.values(schema).map(getTableConfig);
const ids = Object.fromEntries(
  tables.map((table) => [table.name, randomUUID()]),
);
const now = new Date().toISOString();
const timestamps = { created_at: now, updated_at: now };
const graph: Record<string, Record<string, unknown>> = {
  users: {
    id: ids.users,
    full_name: 'SQL fixture',
    status: 'active',
    ...timestamps,
  },
  restaurants: {
    id: ids.restaurants,
    name: 'SQL restaurant',
    slug: randomUUID(),
    status: 'active',
    ...timestamps,
  },
  roles: { id: ids.roles, rol_type: 'owner', created_at: now },
  locations: {
    id: ids.locations,
    restaurant_id: ids.restaurants,
    name: 'Main',
    address: 'Fixture address',
    city: 'Bogotá',
    department: 'Cundinamarca',
    status: 'active',
    ...timestamps,
  },
  restaurant_employees: {
    id: ids.restaurant_employees,
    user_id: ids.users,
    restaurant_id: ids.restaurants,
    role_id: ids.roles,
    status: 'active',
    joined_at: now,
    ...timestamps,
  },
  loyalty_programs: {
    id: ids.loyalty_programs,
    restaurant_id: ids.restaurants,
    name: 'One stamp',
    public_code: randomUUID(),
    stamps_required: 1,
    reward_description: 'Coffee',
    status: 'active',
    terms_locked: true,
    ...timestamps,
  },
  memberships: {
    id: ids.memberships,
    user_id: ids.users,
    program_id: ids.loyalty_programs,
    status: 'active',
    joined_at: now,
    benefits_version: 1,
  },
  loyalty_cards: {
    id: ids.loyalty_cards,
    membership_id: ids.memberships,
    qr_token_hash: randomUUID(),
    status: 'active',
    created_at: now,
  },
  purchases: {
    id: ids.purchases,
    membership_id: ids.memberships,
    employee_id: ids.restaurant_employees,
    location_id: ids.locations,
    stamps_earned: 1,
    sale_reference: 'fixture-sale',
    created_at: now,
  },
  rewards: {
    id: ids.rewards,
    membership_id: ids.memberships,
    description: 'Coffee',
    stamps_spent: 1,
    status: 'redeemed',
    earned_at: now,
    redeemed_at: now,
    redeemed_by: ids.restaurant_employees,
    redeemed_location_id: ids.locations,
  },
  loyalty_ledger_entries: {
    id: ids.loyalty_ledger_entries,
    membership_id: ids.memberships,
    purchase_id: ids.purchases,
    stamp_delta: 1,
    kind: 'purchase',
    actor_id: ids.users,
    request_id: randomUUID(),
    created_at: now,
  },
  invitations: {
    id: ids.invitations,
    restaurant_id: ids.restaurants,
    email: 'fixture@example.test',
    role_id: ids.roles,
    token_hash: randomUUID(),
    expires_at: now,
    status: 'accepted',
    invited_by: ids.restaurant_employees,
    accepted_by: ids.users,
    created_at: now,
  },
  reward_purchase_allocations: {
    id: ids.reward_purchase_allocations,
    reward_id: ids.rewards,
    purchase_id: ids.purchases,
    membership_id: ids.memberships,
    created_at: now,
  },
  closure_consents: {
    id: ids.closure_consents,
    card_id: ids.loyalty_cards,
    user_id: ids.users,
    benefits_version: 1,
    expires_at: now,
    created_at: now,
  },
  idempotency_records: {
    id: ids.idempotency_records,
    actor_id: ids.users,
    key: 'fixture-key',
    fingerprint: 'fixture-fingerprint',
    result: { purchaseId: ids.purchases },
    created_at: now,
  },
  audit_events: {
    id: ids.audit_events,
    actor_id: ids.users,
    restaurant_id: ids.restaurants,
    action: 'fixture.created',
    resource_id: ids.loyalty_cards,
    request_id: randomUUID(),
    details: {},
    created_at: now,
  },
};
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
const checks: [string, string, unknown][] = [
  ['restaurants', 'status', 'invalid'],
  ['locations', 'status', 'invalid'],
  ['users', 'status', 'invalid'],
  ['restaurant_employees', 'status', 'invalid'],
  ['roles', 'rol_type', 'invalid'],
  ['memberships', 'status', 'invalid'],
  ['memberships', 'benefits_version', -1],
  ['loyalty_programs', 'status', 'invalid'],
  ['loyalty_programs', 'stamps_required', 0],
  ['loyalty_cards', 'status', 'invalid'],
  ['purchases', 'stamps_earned', 0],
  ['loyalty_ledger_entries', 'stamp_delta', 0],
  ['rewards', 'stamps_spent', 0],
  ['rewards', 'status', 'invalid'],
  ['invitations', 'status', 'invalid'],
  ['closure_consents', 'benefits_version', -1],
];

describe('TESTDB-001 AC-006/007: integridad real del grafo SQL', () => {
  let database: TestDatabase;
  let databaseName: string;
  beforeAll(async () => {
    database = await createTestDatabase();
    databaseName = (
      await database.pool.query('SELECT current_database() AS name')
    ).rows[0].name;
    const client = await database.pool.connect();
    try {
      await client.query('BEGIN');
      for (const [table, row] of Object.entries(graph)) {
        const columns = Object.keys(row);
        await client.query(
          `INSERT INTO ${quote(table)} (${columns.map(quote).join(',')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(',')})`,
          Object.values(row),
        );
      }
      await client.query(
        "INSERT INTO loyalty_ledger_entries (id,membership_id,reward_id,stamp_delta,kind,actor_id,request_id,created_at) VALUES ($1,$2,$3,-1,'reward_earned',$4,$5,$6)",
        [
          randomUUID(),
          ids.memberships,
          ids.rewards,
          ids.users,
          randomUUID(),
          now,
        ],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });
  afterAll(async () => {
    await database?.cleanup();
    if (!databaseName) return;
    const control = new pg.Client({
      connectionString: validateTestDatabaseUrl(process.env.TEST_DATABASE_URL)
        .href,
    });
    try {
      await control.connect();
      expect(
        (
          await control.query(
            'SELECT datname FROM pg_database WHERE datname=$1',
            [databaseName],
          )
        ).rows,
      ).toEqual([]);
    } finally {
      await control.end();
    }
  });

  async function rejectMutation(
    table: string,
    column: string,
    value: unknown,
    error: Record<string, unknown>,
  ) {
    const original = (
      await database.pool.query(`SELECT * FROM ${quote(table)} WHERE id=$1`, [
        ids[table],
      ])
    ).rows;
    const client = await database.pool.connect();
    try {
      await client.query('BEGIN');
      await expect(
        client.query(
          `UPDATE ${quote(table)} SET ${quote(column)}=$1 WHERE id=$2`,
          [value, ids[table]],
        ),
      ).rejects.toMatchObject(error);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
    expect(
      (
        await database.pool.query(`SELECT * FROM ${quote(table)} WHERE id=$1`, [
          ids[table],
        ])
      ).rows,
    ).toEqual(original);
  }

  it('inserta y recupera las 16 tablas y la cadena cliente → tarjeta → compra → premio', async () => {
    for (const table of Object.keys(graph)) {
      expect(
        (
          await database.pool.query(
            `SELECT id FROM ${quote(table)} WHERE id=$1`,
            [ids[table]],
          )
        ).rows,
      ).toEqual([{ id: ids[table] }]);
    }
    const chain = await database.pool.query(
      `SELECT u.id AS user_id, c.id AS card_id, p.id AS purchase_id, r.id AS reward_id, e.restaurant_id
      FROM users u JOIN memberships m ON m.user_id=u.id JOIN loyalty_cards c ON c.membership_id=m.id
      JOIN purchases p ON p.membership_id=m.id JOIN restaurant_employees e ON e.id=p.employee_id
      JOIN reward_purchase_allocations a ON a.purchase_id=p.id JOIN rewards r ON r.id=a.reward_id WHERE u.id=$1`,
      [ids.users],
    );
    expect(chain.rows).toEqual([
      {
        user_id: ids.users,
        card_id: ids.loyalty_cards,
        purchase_id: ids.purchases,
        reward_id: ids.rewards,
        restaurant_id: ids.restaurants,
      },
    ]);
    expect(
      (
        await database.pool.query(
          'SELECT sum(stamp_delta)::integer AS balance FROM loyalty_ledger_entries WHERE membership_id=$1',
          [ids.memberships],
        )
      ).rows,
    ).toEqual([{ balance: 0 }]);
  });

  it('compara nombres, columnas, destinos y NO ACTION de todas las FK migradas con Drizzle', async () => {
    const actual = (
      await database.pool.query(`SELECT c.conname AS name, source.relname AS source, target.relname AS target,
      ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.num ORDER BY k.ord) AS columns,
      ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.num ORDER BY k.ord) AS referenced,
      c.confupdtype AS update_action,c.confdeltype AS delete_action
      FROM pg_constraint c JOIN pg_class source ON source.oid=c.conrelid JOIN pg_namespace n ON n.oid=source.relnamespace JOIN pg_class target ON target.oid=c.confrelid WHERE c.contype='f' AND n.nspname='public' ORDER BY c.conname`)
    ).rows;
    const expected = tables
      .flatMap((table) =>
        table.foreignKeys.map((key) => {
          const ref = key.reference();
          return {
            name: key.getName(),
            source: table.name,
            target: getTableConfig(ref.foreignTable).name,
            columns: ref.columns.map((column) => column.name),
            referenced: ref.foreignColumns.map((column) => column.name),
            update_action: 'a',
            delete_action: 'a',
          };
        }),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
    expect(actual).toEqual(expected);
  });

  it('compara todas las columnas obligatorias migradas con Drizzle', async () => {
    const actual = (
      await database.pool.query(
        "SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND is_nullable='NO' ORDER BY table_name,column_name",
      )
    ).rows;
    const expected = tables
      .flatMap((table) =>
        table.columns
          .filter((column) => column.notNull)
          .map((column) => ({
            table_name: table.name,
            column_name: column.name,
          })),
      )
      .sort(
        (a, b) =>
          a.table_name.localeCompare(b.table_name) ||
          a.column_name.localeCompare(b.column_name),
      );
    expect(actual).toEqual(expected);
  });

  for (const table of tables) {
    for (const key of table.foreignKeys) {
      const column = key.reference().columns[0];
      if (!column) throw new Error('Foreign key without columns');
      it(`rechaza referencia huérfana ${key.getName()} y conserva el registro`, async () => {
        await rejectMutation(table.name, column.name, randomUUID(), {
          code: '23503',
        });
      });
    }
    it(`rechaza NULL en la clave primaria de ${table.name}`, async () => {
      await rejectMutation(table.name, 'id', null, {
        code: '23502',
        column: 'id',
      });
    });
  }
  it.each(checks)(
    'rechaza CHECK %s.%s=%s conservando la fila',
    async (table, column, value) => {
      await rejectMutation(table, column, value, {
        code: '23514',
        constraint: `${table}_${column}_check`,
      });
    },
  );

  it('cada CHECK vigente tiene un escenario inválido explícito', async () => {
    const actual = (
      await database.pool.query(
        "SELECT conname FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND contype='c' ORDER BY conname",
      )
    ).rows.map((row) => row.conname);
    expect(actual).toEqual(
      checks.map(([table, column]) => `${table}_${column}_check`).sort(),
    );
  });

  it('NO ACTION impide borrar el cliente y conserva toda su historia', async () => {
    await expect(
      database.pool.query('DELETE FROM users WHERE id=$1', [ids.users]),
    ).rejects.toMatchObject({ code: '23503' });
    expect(
      (
        await database.pool.query('SELECT id FROM users WHERE id=$1', [
          ids.users,
        ])
      ).rowCount,
    ).toBe(1);
    expect(
      (
        await database.pool.query(
          'SELECT id FROM memberships WHERE user_id=$1',
          [ids.users],
        )
      ).rowCount,
    ).toBe(1);
  });

  async function transaction(run: (client: pg.PoolClient) => Promise<void>) {
    const client = await database.pool.connect();
    try {
      await client.query('BEGIN');
      await run(client);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  }

  async function clone(
    client: pg.PoolClient,
    table: string,
    overrides: Record<string, unknown> = {},
  ) {
    const row = { ...graph[table], id: randomUUID(), ...overrides };
    const columns = Object.keys(row);
    await client.query(
      `INSERT INTO ${quote(table)} (${columns.map(quote).join(',')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(',')})`,
      Object.values(row),
    );
    return row.id;
  }

  it('DB-004: un rol ordinario no lee, inserta, actualiza ni elimina filas de ninguna tabla', async () => {
    await transaction(async (client) => {
      const role = quote(`fixture_reader_${randomUUID().replaceAll('-', '')}`);
      await client.query(`CREATE ROLE ${role} NOLOGIN`);
      await client.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
      await client.query(
        `GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${role}`,
      );
      await client.query(`SET LOCAL ROLE ${role}`);
      for (const table of Object.keys(graph)) {
        expect(
          (await client.query(`SELECT id FROM ${quote(table)}`)).rows,
          table,
        ).toEqual([]);
        expect(
          (await client.query(`UPDATE ${quote(table)} SET id=id`)).rowCount,
          table,
        ).toBe(0);
        expect(
          (await client.query(`DELETE FROM ${quote(table)}`)).rowCount,
          table,
        ).toBe(0);
        await client.query('SAVEPOINT denied_insert');
        await expect(clone(client, table)).rejects.toMatchObject({
          code: '42501',
        });
        await client.query('ROLLBACK TO SAVEPOINT denied_insert');
      }
    });
    for (const table of Object.keys(graph)) {
      expect(
        (
          await database.pool.query(
            `SELECT id FROM ${quote(table)} WHERE id=$1`,
            [ids[table]],
          )
        ).rowCount,
      ).toBe(1);
    }
  });

  it.each([
    ['restaurants', 'restaurants_slug_unique'],
    ['roles', 'roles_rol_type_unique'],
    ['restaurant_employees', 'restaurant_employees_user_restaurant_unique'],
    ['loyalty_programs', 'loyalty_programs_public_code_unique'],
    ['memberships', 'memberships_open_user_program_unique'],
    ['purchases', 'purchases_location_sale_reference_unique'],
    ['invitations', 'invitations_token_hash_unique'],
    ['idempotency_records', 'idempotency_records_actor_key_unique'],
  ])(
    'rechaza duplicado de %s con la restricción esperada',
    async (table, constraint) => {
      await transaction(async (client) => {
        await expect(clone(client, table)).rejects.toMatchObject({
          code: '23505',
          constraint,
        });
      });
      expect(
        (await database.pool.query(`SELECT id FROM ${quote(table)}`)).rows,
      ).toEqual([{ id: ids[table] }]);
    },
  );

  it('tarjeta única por membresía y hash QR único entre membresías', async () => {
    await transaction(async (client) => {
      await expect(
        clone(client, 'loyalty_cards', { qr_token_hash: randomUUID() }),
      ).rejects.toMatchObject({
        code: '23505',
        constraint: 'loyalty_cards_membership_id_unique',
      });
    });
    await transaction(async (client) => {
      const membershipId = await clone(client, 'memberships', {
        status: 'closed',
        closed_at: now,
      });
      await expect(
        clone(client, 'loyalty_cards', { membership_id: membershipId }),
      ).rejects.toMatchObject({
        code: '23505',
        constraint: 'loyalty_cards_qr_token_hash_unique',
      });
    });
  });

  it('membresía cerrada permite reinscripción pero suspensión sigue reservando el par', async () => {
    await transaction(async (client) => {
      await client.query(
        "UPDATE memberships SET status='closed', closed_at=now() WHERE id=$1",
        [ids.memberships],
      );
      const newId = await clone(client, 'memberships', { status: 'suspended' });
      expect(
        (await client.query('SELECT id FROM memberships WHERE id=$1', [newId]))
          .rowCount,
      ).toBe(1);
      await expect(clone(client, 'memberships')).rejects.toMatchObject({
        code: '23505',
        constraint: 'memberships_open_user_program_unique',
      });
    });
  });

  it.each([
    [
      'loyalty_ledger_entries',
      'purchase_id',
      'purchases',
      'fk_ledger_purchase_membership',
    ],
    [
      'loyalty_ledger_entries',
      'reward_id',
      'rewards',
      'fk_ledger_reward_membership',
    ],
    [
      'reward_purchase_allocations',
      'purchase_id',
      'purchases',
      'fk_allocations_purchase_membership',
    ],
    [
      'reward_purchase_allocations',
      'reward_id',
      'rewards',
      'fk_allocations_reward_membership',
    ],
  ])(
    'rechaza cruce entre membresías en %s.%s aunque ambas referencias existan',
    async (table, column, target, constraint) => {
      await transaction(async (client) => {
        const membershipId = await clone(client, 'memberships', {
          status: 'closed',
          closed_at: now,
        });
        const otherId = await clone(client, target, {
          membership_id: membershipId,
          ...(target === 'purchases' ? { sale_reference: 'other-sale' } : {}),
        });
        await expect(
          client.query(
            `UPDATE ${quote(table)} SET ${quote(column)}=$1 WHERE id=$2`,
            [otherId, ids[table]],
          ),
        ).rejects.toMatchObject({ code: '23503', constraint });
      });
    },
  );

  it('asignación activa única: liberar permite reasignar, pero conserva la pareja histórica única', async () => {
    await transaction(async (client) => {
      const rewardId = await clone(client, 'rewards');
      await client.query('SAVEPOINT duplicate');
      await expect(
        clone(client, 'reward_purchase_allocations', { reward_id: rewardId }),
      ).rejects.toMatchObject({
        code: '23505',
        constraint: 'reward_purchase_allocations_active_purchase_unique',
      });
      await client.query('ROLLBACK TO SAVEPOINT duplicate');
      await client.query(
        'UPDATE reward_purchase_allocations SET released_at=now() WHERE id=$1',
        [ids.reward_purchase_allocations],
      );
      await clone(client, 'reward_purchase_allocations', {
        reward_id: rewardId,
      });
      expect(
        (
          await client.query(
            'SELECT id FROM reward_purchase_allocations WHERE purchase_id=$1 AND released_at IS NULL',
            [ids.purchases],
          )
        ).rowCount,
      ).toBe(1);
      await expect(
        clone(client, 'reward_purchase_allocations', { released_at: now }),
      ).rejects.toMatchObject({
        code: '23505',
        constraint: 'reward_purchase_allocations_reward_purchase_unique',
      });
    });
  });
});
