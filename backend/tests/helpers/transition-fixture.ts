import { randomUUID } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createTestDatabase, type TestDatabase } from './database.js';

export async function sourceDatabase() {
  const database = await createTestDatabase({ migrate: false });
  const directory = await mkdtemp(join(tmpdir(), 'loyalty-transition-'));
  const source = fileURLToPath(new URL('../../drizzle/', import.meta.url));
  try {
    const journal = JSON.parse(
      await readFile(join(source, 'meta/_journal.json'), 'utf8'),
    );
    journal.entries = journal.entries.slice(0, 5);
    await mkdir(join(directory, 'meta'));
    await writeFile(
      join(directory, 'meta/_journal.json'),
      JSON.stringify(journal),
    );
    for (const entry of journal.entries) {
      await cp(
        join(source, `${entry.tag}.sql`),
        join(directory, `${entry.tag}.sql`),
      );
    }
    await migrate(database.db, { migrationsFolder: directory });
    return database;
  } catch (error) {
    await database.cleanup();
    throw error;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function fixture(database: TestDatabase) {
  const ids = Object.fromEntries(
    [
      'owner',
      'otherOwner',
      'admin',
      'customer',
      'restaurant',
      'location',
      'ownerRole',
      'adminRole',
      'ownerEmployee',
      'otherOwnerEmployee',
      'adminEmployee',
      'program',
      'otherProgram',
      'membership',
      'mixedMembership',
      'card',
      'reward',
    ].map((key) => [key, randomUUID()]),
  ) as Record<string, string>;
  await database.pool.query(
    `INSERT INTO users(id,full_name,email,phone,password_hash,status,created_at,updated_at)
    VALUES ($1,'PRIVATE NAME','private@example.test','+573001234567','private-hash','active',now(),now()),
    ($2,'PRIVATE NAME',null,null,null,'active',now(),now()),
    ($3,'PRIVATE NAME',null,'+57 300 0000000',null,'active',now(),now()),
    ($4,'PRIVATE NAME',null,'+573001234567',null,'active',now(),now())`,
    [ids.owner, ids.otherOwner, ids.admin, ids.customer],
  );
  await database.pool.query(
    "INSERT INTO restaurants(id,name,status,created_at,updated_at) VALUES($1,'PRIVATE NAME','active',now(),now())",
    [ids.restaurant],
  );
  await database.pool.query(
    "INSERT INTO locations(id,restaurant_id,name,address,city,department,status,created_at,updated_at) VALUES($1,$2,'PRIVATE NAME','PRIVATE ADDRESS','city','department','active',now(),now())",
    [ids.location, ids.restaurant],
  );
  await database.pool.query(
    "INSERT INTO roles(id,rol_type,created_at) VALUES($1,'owner',now()),($2,'admin',now())",
    [ids.ownerRole, ids.adminRole],
  );
  await database.pool.query(
    `INSERT INTO restaurant_employees(id,user_id,restaurant_id,role_id,status,joined_at,created_at,updated_at)
    VALUES($1,$2,$3,$4,'active',now(),now(),now()),($5,$6,$3,$4,'active',now(),now(),now()),
    ($7,$8,$3,$9,'active',now(),now(),now())`,
    [
      ids.ownerEmployee,
      ids.owner,
      ids.restaurant,
      ids.ownerRole,
      ids.otherOwnerEmployee,
      ids.otherOwner,
      ids.adminEmployee,
      ids.admin,
      ids.adminRole,
    ],
  );
  await database.pool.query(
    `INSERT INTO loyalty_programs(id,restaurant_id,name,public_code,stamps_required,reward_description,status,created_at,updated_at)
    VALUES($1,$3,'PRIVATE NAME',$1::uuid::text,3,'PRIVATE REWARD','active',now(),now()),
    ($2,$3,'PRIVATE NAME',$2::uuid::text,3,'PRIVATE REWARD','active',now(),now())`,
    [ids.program, ids.otherProgram, ids.restaurant],
  );
  await database.pool.query(
    `INSERT INTO memberships(id,user_id,program_id,status,joined_at)
    VALUES($1,$2,$3,'active',now()),($4,$5,$3,'active',now()),($6,$7,$3,'active',now()),($8,$9,$3,'closed',now())`,
    [
      ids.membership,
      ids.customer,
      ids.program,
      ids.mixedMembership,
      ids.owner,
      randomUUID(),
      ids.admin,
      randomUUID(),
      ids.otherOwner,
    ],
  );
  await database.pool.query(
    "INSERT INTO loyalty_cards(id,membership_id,qr_token_hash,qr_token_encrypted,status,created_at) VALUES($1,$2,'private-token-hash','private-token-ciphertext','active',now())",
    [ids.card, ids.membership],
  );
  await database.pool.query(
    "INSERT INTO rewards(id,membership_id,description,stamps_spent,status,earned_at) VALUES($1,$2,'PRIVATE REWARD',3,'available',now())",
    [ids.reward, ids.membership],
  );
  for (let index = 0; index < 4; index++) {
    const purchaseId = randomUUID();
    await database.pool.query(
      'INSERT INTO purchases(id,membership_id,employee_id,location_id,stamps_earned,created_at,sale_reference) VALUES($1,$2,$3,$4,1,now(),$5)',
      [
        purchaseId,
        ids.membership,
        ids.ownerEmployee,
        ids.location,
        `PRIVATE-SALE-${index}`,
      ],
    );
    await database.pool.query(
      "INSERT INTO loyalty_ledger_entries(id,membership_id,purchase_id,stamp_delta,created_at,kind,actor_id,request_id) VALUES($1,$2,$3,1,now(),'purchase',$4,'private-request')",
      [randomUUID(), ids.membership, purchaseId, ids.owner],
    );
    if (index < 3)
      await database.pool.query(
        'INSERT INTO reward_purchase_allocations(id,reward_id,purchase_id,membership_id,created_at) VALUES($1,$2,$3,$4,now())',
        [randomUUID(), ids.reward, purchaseId, ids.membership],
      );
  }
  await database.pool.query(
    "INSERT INTO loyalty_ledger_entries(id,membership_id,reward_id,stamp_delta,created_at,kind,actor_id,request_id) VALUES($1,$2,$3,-3,now(),'reward_earned',$4,'private-request')",
    [randomUUID(), ids.membership, ids.reward, ids.owner],
  );
  return ids;
}

export async function snapshot(database: TestDatabase) {
  const tables = (
    await database.pool.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
    )
  ).rows;
  const result: Record<string, unknown> = {};
  for (const { tablename } of tables) {
    const columns = (
      await database.pool.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema='public' AND table_name=$1`,
        [tablename],
      )
    ).rows.map((row) => row.column_name);
    const order = columns.includes('id')
      ? 'id'
      : columns.includes('lease_token')
        ? 'lease_token'
        : columns[0];
    result[tablename] = (
      await database.pool.query(
        order
          ? `SELECT * FROM "${tablename}" ORDER BY "${order}"`
          : `SELECT * FROM "${tablename}"`,
      )
    ).rows;
  }
  return result;
}
