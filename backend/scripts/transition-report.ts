import { fileURLToPath } from 'node:url';
import pg from 'pg';

export function validateTransitionDatabaseUrl(value: string | undefined) {
  const invalid = new Error(
    'TRANSITION_DATABASE_URL requiere una copia PostgreSQL local.',
  );
  let url: URL;
  try {
    url = new URL(value ?? '');
  } catch {
    throw invalid;
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    !/^\/loyalty_(test|copy)_[a-zA-Z0-9_]+$/.test(url.pathname) ||
    url.search ||
    url.hash
  )
    throw invalid;
  return url;
}

export interface ReportConnection {
  query(text: string): Promise<{ rows: Record<string, unknown>[] }>;
}

const tables = [
  'audit_events',
  'closure_consents',
  'idempotency_records',
  'invitations',
  'locations',
  'loyalty_cards',
  'loyalty_ledger_entries',
  'loyalty_programs',
  'memberships',
  'purchases',
  'restaurant_employees',
  'restaurants',
  'reward_purchase_allocations',
  'rewards',
  'roles',
  'users',
];

export interface TransitionFinding {
  code: string;
  severity: 'blocker' | 'info';
  entityType: string;
  entityIds: string[];
}

export interface MembershipInventory {
  membershipId: string;
  balance: number;
  purchases: number;
  availableRewards: number;
  redeemedRewards: number;
}

export interface TransitionReport {
  schemaVersion: 1;
  sourceSchema: '0004';
  mode: 'read-only';
  conversionAllowed: false;
  counts: Record<string, number>;
  memberships: MembershipInventory[];
  findings: TransitionFinding[];
}

function integer(value: unknown) {
  const number = Number(value);
  if (!Number.isSafeInteger(number))
    throw new Error('Inventario fuera de rango.');
  return number;
}

// El SQL devuelve identificadores y clasificaciones, nunca los datos privados.
const findingsQuery = `WITH balances AS (
  SELECT m.id, COALESCE(sum(l.stamp_delta),0) AS balance FROM memberships m
  LEFT JOIN loyalty_ledger_entries l ON l.membership_id=m.id GROUP BY m.id
), reward_checks AS (
  SELECT r.*, COALESCE((SELECT sum(l.stamp_delta) FROM loyalty_ledger_entries l WHERE l.reward_id=r.id),0) AS debit,
    (SELECT count(*) FROM reward_purchase_allocations a WHERE a.reward_id=r.id AND a.released_at IS NULL) AS allocations
  FROM rewards r
), findings AS (
  SELECT 'customer_phone_missing' AS code, 'blocker' AS severity, 'user' AS entity_type, ARRAY[u.id] AS entity_ids
  FROM users u WHERE (u.phone IS NULL OR btrim(u.phone)='') AND EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=u.id)
  UNION ALL
  SELECT 'customer_phone_noncanonical','blocker','user',ARRAY[u.id] FROM users u
  WHERE u.phone IS NOT NULL AND btrim(u.phone)<>'' AND u.phone !~ '^\\+[1-9][0-9]{1,14}$'
    AND EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=u.id)
  UNION ALL
  SELECT 'customer_phone_unverified','blocker','user',ARRAY[u.id] FROM users u
  WHERE u.phone IS NOT NULL AND btrim(u.phone)<>'' AND EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=u.id)
  UNION ALL
  SELECT 'canonical_phone_collision','blocker','user',array_agg(u.id ORDER BY u.id)
  FROM users u WHERE u.phone ~ '^\\+[1-9][0-9]{1,14}$' GROUP BY u.phone HAVING count(*)>1
  UNION ALL
  SELECT 'mixed_account','info','user',ARRAY[u.id] FROM users u
  WHERE EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=u.id)
    AND EXISTS(SELECT 1 FROM restaurant_employees e WHERE e.user_id=u.id)
  UNION ALL
  SELECT 'owner_missing','blocker','restaurant',ARRAY[r.id] FROM restaurants r
  WHERE NOT EXISTS(SELECT 1 FROM restaurant_employees e JOIN roles role ON role.id=e.role_id
    WHERE e.restaurant_id=r.id AND e.status='active' AND role.rol_type='owner')
  UNION ALL
  SELECT 'owner_ambiguous','blocker','restaurant',ARRAY[r.id] FROM restaurants r
  WHERE (SELECT count(*) FROM restaurant_employees e JOIN roles role ON role.id=e.role_id
    WHERE e.restaurant_id=r.id AND e.status='active' AND role.rol_type='owner')>1
  UNION ALL
  SELECT 'legacy_admin','blocker','employee',ARRAY[e.id] FROM restaurant_employees e
  JOIN roles role ON role.id=e.role_id WHERE role.rol_type='admin'
  UNION ALL
  SELECT 'multiple_active_programs','blocker','restaurant',ARRAY[p.restaurant_id] FROM loyalty_programs p
  WHERE p.status='active' GROUP BY p.restaurant_id HAVING count(*)>1
  UNION ALL
  SELECT 'legacy_invitation','blocker','invitation',ARRAY[i.id] FROM invitations i WHERE i.status='pending'
  UNION ALL
  SELECT 'local_password_present','info','user',ARRAY[u.id] FROM users u WHERE u.password_hash IS NOT NULL
  UNION ALL
  SELECT 'purchase_requires_review','blocker','purchase',ARRAY[p.id] FROM purchases p
  WHERE p.sale_reference IS NULL OR btrim(p.sale_reference)='' OR p.stamps_earned<>1
  UNION ALL
  SELECT 'ledger_requires_review','blocker','ledger_entry',ARRAY[l.id] FROM loyalty_ledger_entries l
  WHERE l.kind IS NULL OR l.actor_id IS NULL OR l.request_id IS NULL OR l.created_at IS NULL
  UNION ALL
  SELECT 'negative_balance','blocker','membership',ARRAY[b.id] FROM balances b WHERE b.balance<0
  UNION ALL
  SELECT 'reward_requires_review','blocker','reward',ARRAY[r.id] FROM reward_checks r
  WHERE r.status IN ('available','redeemed') AND (r.debit<>-r.stamps_spent OR r.allocations<>r.stamps_spent
    OR (r.status='redeemed' AND (r.redeemed_at IS NULL OR r.redeemed_by IS NULL OR r.redeemed_location_id IS NULL)))
  UNION ALL
  SELECT 'legacy_reward_already_debited','info','reward',ARRAY[r.id] FROM reward_checks r
  WHERE r.status='available' AND r.debit=-r.stamps_spent
  UNION ALL
  SELECT 'legacy_reward_with_remaining_balance','info','membership',ARRAY[b.id] FROM balances b
  WHERE b.balance>0 AND EXISTS(SELECT 1 FROM rewards r WHERE r.membership_id=b.id AND r.status='available')
) SELECT code,severity,entity_type,entity_ids FROM findings ORDER BY code,entity_type,entity_ids`;

/** Requires a dedicated connection, never a pool or an existing transaction. */
export async function collectTransitionReport(
  connection: ReportConnection,
): Promise<TransitionReport> {
  await connection.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    await connection.query("SET LOCAL statement_timeout = '15s'");
    await connection.query("SET LOCAL lock_timeout = '3s'");
    const columns = (
      await connection.query(`SELECT table_name,column_name FROM information_schema.columns
      WHERE table_schema='public' ORDER BY table_name,column_name`)
    ).rows;
    const present = new Set(columns.map((row) => row.table_name));
    if (
      tables.some((table) => !present.has(table)) ||
      columns.some(
        (row) =>
          row.table_name === 'customers' ||
          (row.table_name === 'restaurants' && row.column_name === 'slug') ||
          (row.table_name === 'memberships' &&
            row.column_name === 'customer_id') ||
          (row.table_name === 'rewards' &&
            row.column_name === 'accounting_mode'),
      )
    ) {
      throw new Error('El informe requiere una copia del esquema 0004.');
    }
    const counts = Object.fromEntries(
      (
        await connection.query(
          tables
            .map(
              (table) =>
                `SELECT '${table}' AS table_name,count(*) AS count FROM "${table}"`,
            )
            .join(' UNION ALL '),
        )
      ).rows.map((row) => [String(row.table_name), integer(row.count)]),
    );
    const memberships = (
      await connection.query(`SELECT m.id AS membership_id,
      COALESCE((SELECT sum(l.stamp_delta) FROM loyalty_ledger_entries l WHERE l.membership_id=m.id),0) AS balance,
      (SELECT count(*) FROM purchases p WHERE p.membership_id=m.id) AS purchases,
      (SELECT count(*) FROM rewards r WHERE r.membership_id=m.id AND r.status='available') AS available_rewards,
      (SELECT count(*) FROM rewards r WHERE r.membership_id=m.id AND r.status='redeemed') AS redeemed_rewards
      FROM memberships m ORDER BY m.id`)
    ).rows.map((row) => ({
      membershipId: String(row.membership_id),
      balance: integer(row.balance),
      purchases: integer(row.purchases),
      availableRewards: integer(row.available_rewards),
      redeemedRewards: integer(row.redeemed_rewards),
    }));
    const findings = (await connection.query(findingsQuery)).rows.map(
      (row) => ({
        code: String(row.code),
        severity: row.severity as 'blocker' | 'info',
        entityType: String(row.entity_type),
        entityIds: row.entity_ids as string[],
      }),
    );
    return {
      schemaVersion: 1,
      sourceSchema: '0004',
      mode: 'read-only',
      conversionAllowed: false,
      counts,
      memberships,
      findings,
    };
  } finally {
    await connection.query('ROLLBACK');
  }
}

async function main() {
  const url = validateTransitionDatabaseUrl(
    process.env.TRANSITION_DATABASE_URL,
  );
  const connection = new pg.Client({
    connectionString: url.href,
    connectionTimeoutMillis: 5000,
  });
  try {
    await connection.connect();
    process.stdout.write(
      `${JSON.stringify(await collectTransitionReport(connection), null, 2)}\n`,
    );
  } finally {
    await connection.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    process.stderr.write(
      'No se pudo obtener el informe. Revise la copia local explícita y su esquema 0004.\n',
    );
    process.exitCode = 1;
  });
}
