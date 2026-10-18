import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createStaffService,
  type StaffAction,
} from '../../src/application/staff.js';
import type { VerifiedIdentity } from '../../src/domain/identity.js';
import { PgStaffRepository } from '../../src/infrastructure/staff-repository.js';
import { createTestDatabase, type TestDatabase } from '../helpers/database.js';

let database: TestDatabase;
let date = new Date('2026-10-18T12:00:00Z');
let service: ReturnType<typeof createStaffService>;
beforeAll(async () => {
  database = await createTestDatabase();
  service = createStaffService(
    new PgStaffRepository(database.pool, {
      tokenEncryptionKey: 'ab'.repeat(32),
      now: () => date,
    }),
  );
});
afterAll(async () => {
  await database?.cleanup();
});

async function actor(): Promise<VerifiedIdentity> {
  const id = randomUUID();
  const identity = { id, email: `${id}@example.test`, emailVerified: true };
  await database.pool.query(
    `INSERT INTO users(id,full_name,email,status,created_at,updated_at)
    VALUES($1,'Test User',$2,'active',now(),now())`,
    [id, identity.email],
  );
  return identity;
}
async function fixture() {
  const owner = await actor();
  const admin = await actor();
  const employee = await actor();
  const restaurantId = randomUUID();
  await database.pool.query(
    `INSERT INTO restaurants(id,name,slug,status,created_at,updated_at)
    VALUES($1,'Restaurant',$2,'active',now(),now())`,
    [restaurantId, restaurantId],
  );
  const employeeIds: string[] = [];
  for (const [identity, role] of [
    [owner, 'owner'],
    [admin, 'admin'],
    [employee, 'employee'],
  ] as const) {
    const roleId = (
      await database.pool.query(
        `INSERT INTO roles(id,rol_type,created_at) VALUES($1,$2,now())
      ON CONFLICT(rol_type) DO UPDATE SET rol_type=EXCLUDED.rol_type RETURNING id`,
        [randomUUID(), role],
      )
    ).rows[0].id;
    const id = randomUUID();
    employeeIds.push(id);
    await database.pool.query(
      `INSERT INTO restaurant_employees(id,user_id,restaurant_id,role_id,status,joined_at,created_at,updated_at)
      VALUES($1,$2,$3,$4,'active',now(),now(),now())`,
      [id, identity.id, restaurantId, roleId],
    );
  }
  return { owner, admin, employee, restaurantId, employeeIds };
}
function execute(
  who: VerifiedIdentity,
  action: StaffAction,
  input: unknown,
  restaurantId?: string,
  targetId?: string,
  key = randomUUID(),
) {
  return service.execute({
    actor: who,
    action,
    input,
    key,
    requestId: 'staff-tests',
    ...(restaurantId ? { restaurantId } : {}),
    ...(targetId ? { targetId } : {}),
  });
}

describe('STAFF-001 PostgreSQL transactions and permissions', () => {
  it('AC-007 concurrent acceptance does not duplicate staff and replay cannot reactivate disabled membership', async () => {
    const f = await fixture();
    const receiver = await actor();
    const invitation = await execute(
      f.owner,
      'invitation.create',
      { email: receiver.email, role: 'employee' },
      f.restaurantId,
    );
    const token = (invitation.data as { token: string }).token;
    const key = randomUUID();
    const responses = await Promise.all([
      execute(
        receiver,
        'invitation.accept',
        { token },
        undefined,
        undefined,
        key,
      ),
      execute(receiver, 'invitation.accept', { token }),
    ]);
    expect(responses[0]).toEqual(responses[1]);
    const employeeId = (responses[0].data as { id: string }).id;
    await execute(
      f.owner,
      'employee.update',
      { status: 'disabled' },
      f.restaurantId,
      employeeId,
    );
    await expect(
      execute(
        receiver,
        'invitation.accept',
        { token },
        undefined,
        undefined,
        key,
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      (
        await database.pool.query(
          'SELECT status FROM restaurant_employees WHERE id=$1',
          [employeeId],
        )
      ).rows[0].status,
    ).toBe('disabled');
  });

  it('AC-007 rolls back duplicate restaurant slug and rechecks access before replay', async () => {
    const f = await fixture();
    const other = await actor();
    await expect(
      execute(other, 'restaurant.create', {
        name: 'Duplicate',
        slug: f.restaurantId,
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (
        await database.pool.query(
          'SELECT id FROM restaurant_employees WHERE user_id=$1',
          [other.id],
        )
      ).rowCount,
    ).toBe(0);
    expect(
      (
        await database.pool.query(
          'SELECT id FROM audit_events WHERE actor_id=$1',
          [other.id],
        )
      ).rowCount,
    ).toBe(0);
    const key = randomUUID();
    const input = {
      name: 'Branch',
      address: 'Street',
      city: 'City',
      department: 'State',
    };
    await execute(
      f.admin,
      'location.create',
      input,
      f.restaurantId,
      undefined,
      key,
    );
    await execute(
      f.owner,
      'employee.update',
      { status: 'suspended' },
      f.restaurantId,
      f.employeeIds[1],
    );
    await expect(
      execute(
        f.admin,
        'location.create',
        input,
        f.restaurantId,
        undefined,
        key,
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      (
        await database.pool.query(
          'SELECT id FROM locations WHERE restaurant_id=$1',
          [f.restaurantId],
        )
      ).rowCount,
    ).toBe(1);
  });

  it('AC-005 keeps invitation and membership unchanged when inviter targets an existing admin', async () => {
    const f = await fixture();
    const invitation = await execute(
      f.admin,
      'invitation.create',
      { email: f.owner.email, role: 'employee' },
      f.restaurantId,
    );
    const data = invitation.data as { id: string; token: string };
    await expect(
      execute(f.owner, 'invitation.accept', { token: data.token }),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      (
        await database.pool.query(
          'SELECT status FROM invitations WHERE id=$1',
          [data.id],
        )
      ).rows[0].status,
    ).toBe('pending');
    expect(
      (
        await database.pool.query(
          'SELECT r.rol_type FROM restaurant_employees e JOIN roles r ON r.id=e.role_id WHERE e.user_id=$1 AND e.restaurant_id=$2',
          [f.owner.id, f.restaurantId],
        )
      ).rows[0].rol_type,
    ).toBe('owner');
  });

  it('AC-001 creates restaurant and owner once under concurrent replay', async () => {
    const who = await actor();
    const key = randomUUID();
    const input = { name: 'Cafe', slug: randomUUID() };
    const results = await Promise.all([
      execute(who, 'restaurant.create', input, undefined, undefined, key),
      execute(who, 'restaurant.create', input, undefined, undefined, key),
    ]);
    expect(results[0]).toMatchObject({
      data: { name: 'Cafe', status: 'active' },
    });
    expect(JSON.parse(JSON.stringify(results[0]))).toEqual(results[1]);
    const rows = await database.pool.query(
      `SELECT r.rol_type FROM restaurant_employees e
      JOIN roles r ON r.id=e.role_id WHERE e.user_id=$1`,
      [who.id],
    );
    expect(rows.rows).toEqual([{ rol_type: 'owner' }]);
    expect(
      (
        await database.pool.query(
          'SELECT id FROM audit_events WHERE actor_id=$1',
          [who.id],
        )
      ).rowCount,
    ).toBe(1);
    await expect(
      execute(
        who,
        'restaurant.create',
        { ...input, name: 'Changed' },
        undefined,
        undefined,
        key,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('AC-002 rejects cross-restaurant and employee management without effects', async () => {
    const f = await fixture();
    const stranger = await actor();
    await expect(
      execute(stranger, 'restaurant.update', { name: 'Wrong' }, f.restaurantId),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      execute(
        f.employee,
        'restaurant.update',
        { name: 'Wrong' },
        f.restaurantId,
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      execute(
        f.admin,
        'employee.update',
        { status: 'disabled' },
        f.restaurantId,
        f.employeeIds[0],
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      execute(
        f.admin,
        'employee.update',
        { role: 'admin' },
        f.restaurantId,
        f.employeeIds[2],
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      (
        await database.pool.query('SELECT name FROM restaurants WHERE id=$1', [
          f.restaurantId,
        ])
      ).rows[0].name,
    ).toBe('Restaurant');
    expect(
      (
        await database.pool.query(
          'SELECT id FROM audit_events WHERE restaurant_id=$1',
          [f.restaurantId],
        )
      ).rowCount,
    ).toBe(0);
  });

  it('AC-003 manages locations logically and protects suspended restaurants', async () => {
    const f = await fixture();
    const created = await execute(
      f.admin,
      'location.create',
      { name: 'Branch', address: 'Street', city: 'City', department: 'State' },
      f.restaurantId,
    );
    const locationId = (created.data as { id: string }).id;
    await execute(
      f.admin,
      'location.update',
      { status: 'inactive' },
      f.restaurantId,
      locationId,
    );
    expect(
      (
        await database.pool.query('SELECT status FROM locations WHERE id=$1', [
          locationId,
        ])
      ).rows[0].status,
    ).toBe('inactive');
    await expect(
      execute(
        f.admin,
        'restaurant.update',
        { status: 'suspended' },
        f.restaurantId,
      ),
    ).rejects.toMatchObject({ status: 403 });
    await execute(
      f.owner,
      'restaurant.update',
      { status: 'suspended' },
      f.restaurantId,
    );
    await expect(
      execute(
        f.admin,
        'location.update',
        { status: 'active' },
        f.restaurantId,
        locationId,
      ),
    ).rejects.toMatchObject({ status: 403 });
    await execute(
      f.owner,
      'restaurant.update',
      { status: 'active' },
      f.restaurantId,
    );
  });

  it('AC-004 invites by verified email, stores only hashed/encrypted token and accepts once', async () => {
    const f = await fixture();
    const receiver = await actor();
    const invitation = await execute(
      f.admin,
      'invitation.create',
      { email: receiver.email.toUpperCase(), role: 'employee' },
      f.restaurantId,
    );
    const data = invitation.data as {
      id: string;
      token: string;
      expires_at: string;
    };
    expect(data.token).toHaveLength(43);
    expect(new Date(data.expires_at).getTime() - date.getTime()).toBe(
      7 * 86400000,
    );
    const persisted = await database.pool.query(
      'SELECT * FROM invitations WHERE id=$1',
      [data.id],
    );
    expect(JSON.stringify(persisted.rows)).not.toContain(data.token);
    expect(
      JSON.stringify(
        (
          await database.pool.query(
            'SELECT result FROM idempotency_records WHERE actor_id=$1',
            [f.admin.id],
          )
        ).rows,
      ),
    ).not.toContain(data.token);
    await expect(
      execute(await actor(), 'invitation.accept', { token: data.token }),
    ).rejects.toMatchObject({ status: 403 });
    const first = await execute(receiver, 'invitation.accept', {
      token: data.token,
    });
    const second = await execute(receiver, 'invitation.accept', {
      token: data.token,
    });
    expect(first).toEqual(second);
    expect(
      (
        await database.pool.query(
          'SELECT id FROM restaurant_employees WHERE user_id=$1 AND restaurant_id=$2',
          [receiver.id, f.restaurantId],
        )
      ).rowCount,
    ).toBe(1);
  });

  it('AC-005 rejects revoked, expired invitations and changed issuer permissions', async () => {
    const f = await fixture();
    const receiver = await actor();
    const create = async () =>
      (
        await execute(
          f.owner,
          'invitation.create',
          { email: receiver.email, role: 'admin' },
          f.restaurantId,
        )
      ).data as { id: string; token: string };
    const revoked = await create();
    await execute(f.owner, 'invitation.revoke', {}, f.restaurantId, revoked.id);
    await expect(
      execute(receiver, 'invitation.accept', { token: revoked.token }),
    ).rejects.toMatchObject({ status: 409 });
    const expired = await create();
    date = new Date(date.getTime() + 7 * 86400000);
    await expect(
      execute(receiver, 'invitation.accept', { token: expired.token }),
    ).rejects.toMatchObject({ status: 409 });
    const pending = (
      await execute(
        f.admin,
        'invitation.create',
        { email: receiver.email, role: 'employee' },
        f.restaurantId,
      )
    ).data as { token: string };
    await execute(
      f.owner,
      'employee.update',
      { role: 'employee' },
      f.restaurantId,
      f.employeeIds[1],
    );
    await expect(
      execute(receiver, 'invitation.accept', { token: pending.token }),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      (
        await database.pool.query(
          'SELECT id FROM restaurant_employees WHERE user_id=$1 AND restaurant_id=$2',
          [receiver.id, f.restaurantId],
        )
      ).rowCount,
    ).toBe(0);
  });

  it('AC-006 paginates membership-scoped lists without revealing invitation tokens', async () => {
    const f = await fixture();
    const receiver = await actor();
    await execute(
      f.admin,
      'invitation.create',
      { email: receiver.email, role: 'employee' },
      f.restaurantId,
    );
    const page = await service.query({
      actor: f.owner,
      collection: 'employees',
      restaurantId: f.restaurantId,
      limit: 2,
    });
    expect(page.data).toHaveLength(2);
    expect(page.next_cursor).toEqual(expect.any(String));
    const next = await service.query({
      actor: f.owner,
      collection: 'employees',
      restaurantId: f.restaurantId,
      limit: 2,
      cursor: page.next_cursor as string,
    });
    expect(next.data).toHaveLength(1);
    expect(next.next_cursor).toBeNull();
    const invitations = await service.query({
      actor: f.owner,
      collection: 'invitations',
      restaurantId: f.restaurantId,
    });
    expect(JSON.stringify(invitations)).not.toMatch(/token|hash|encrypted/);
    await expect(
      service.query({
        actor: receiver,
        collection: 'employees',
        restaurantId: f.restaurantId,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
