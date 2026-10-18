import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Profile } from '../../src/domain/identity.js';
import { PgProfileRepository } from '../../src/infrastructure/profile-repository.js';
import { createTestDatabase, type TestDatabase } from '../helpers/database.js';

describe('IDENTITY-001 persistencia real', () => {
  let database: TestDatabase;
  let profiles: PgProfileRepository;
  const now = new Date('2026-10-18T12:00:00Z');
  const profile: Profile = {
    id: randomUUID(),
    full_name: 'Client',
    email: 'client@example.test',
    phone: '123',
    status: 'active',
    created_at: now,
    updated_at: now,
  };
  beforeAll(async () => {
    database = await createTestDatabase();
    profiles = new PgProfileRepository(database.pool);
  });
  afterAll(async () => {
    if (database) await database.cleanup();
  });
  it('AC-006 altas simultáneas crean exactamente una identidad', async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () => profiles.createIfAbsent(profile)),
    );
    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(results.every((result) => result.profile.id === profile.id)).toBe(
      true,
    );
    expect(
      (await database.pool.query('SELECT count(*)::int AS n FROM users'))
        .rows[0].n,
    ).toBe(1);
  });
  it('AC-003 parches simultáneos conservan campos no enviados', async () => {
    await Promise.all([
      profiles.updateActive(profile.id, { full_name: 'Updated' }, now),
      profiles.updateActive(profile.id, { phone: '456' }, now),
    ]);
    expect(await profiles.findById(profile.id)).toMatchObject({
      full_name: 'Updated',
      phone: '456',
    });
  });
  it('AC-004 no reactiva perfil ni actualiza después de suspensión', async () => {
    await database.pool.query(
      "UPDATE users SET status='suspended' WHERE id=$1",
      [profile.id],
    );
    expect((await profiles.createIfAbsent(profile)).profile.status).toBe(
      'suspended',
    );
    expect(
      (await profiles.updateActive(profile.id, { phone: 'bad' }, now))?.status,
    ).toBe('suspended');
    expect((await profiles.findById(profile.id))?.phone).toBe('456');
  });
});
