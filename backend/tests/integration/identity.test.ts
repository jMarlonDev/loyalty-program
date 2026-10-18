import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Profile } from '../../src/domain/identity.js';
import { PgProfileRepository } from '../../src/infrastructure/profile-repository.js';
import { createTestDatabase, type TestDatabase } from '../helpers/database.js';

describe('IDENTITY-001 persistencia real', () => {
  let database: TestDatabase;
  let profiles: PgProfileRepository;
  const now = new Date('2026-10-18T12:00:00Z');
  let profile: Profile;
  beforeAll(async () => {
    database = await createTestDatabase();
    profiles = new PgProfileRepository(database.pool);
  });
  beforeEach(() => {
    profile = {
      id: randomUUID(),
      full_name: 'Client',
      email: 'client@example.test',
      phone: '123',
      status: 'active',
      created_at: now,
      updated_at: now,
    };
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
    const persisted = await database.pool.query(
      'SELECT id,password_hash FROM users WHERE id=$1',
      [profile.id],
    );
    expect(persisted.rows).toEqual([{ id: profile.id, password_hash: null }]);
  });
  it('AC-003 parches simultáneos conservan campos no enviados', async () => {
    await profiles.createIfAbsent(profile);
    const updatedAt = new Date(now.getTime() + 1000);
    await Promise.all([
      profiles.updateActive(profile.id, { full_name: 'Updated' }, updatedAt),
      profiles.updateActive(profile.id, { phone: '456' }, updatedAt),
    ]);
    expect(await profiles.findById(profile.id)).toEqual({
      ...profile,
      full_name: 'Updated',
      phone: '456',
      updated_at: updatedAt,
    });
  });
  it.each(['suspended', 'closed'] as const)(
    'AC-004 no reactiva ni actualiza perfil %s',
    async (status) => {
      await profiles.createIfAbsent(profile);
      await database.pool.query('UPDATE users SET status=$1 WHERE id=$2', [
        status,
        profile.id,
      ]);
      expect(
        (await profiles.createIfAbsent({ ...profile, full_name: 'Overwrite' }))
          .profile.status,
      ).toBe(status);
      expect(
        (
          await profiles.updateActive(
            profile.id,
            { phone: 'bad' },
            new Date(now.getTime() + 1000),
          )
        )?.status,
      ).toBe(status);
      expect(await profiles.findById(profile.id)).toEqual({
        ...profile,
        status,
      });
    },
  );
  it('AC-002 conserva dos sujetos con el mismo correo y no sobrescribe al repetir alta', async () => {
    const other = { ...profile, id: randomUUID(), full_name: 'Other' };
    await Promise.all([
      profiles.createIfAbsent(profile),
      profiles.createIfAbsent(other),
    ]);
    expect(
      await profiles.createIfAbsent({
        ...profile,
        email: 'changed@example.test',
        full_name: 'Overwrite',
        phone: null,
      }),
    ).toEqual({ created: false, profile });
    await profiles.updateActive(profile.id, { phone: null }, now);
    expect(await profiles.findById(other.id)).toEqual(other);
    expect(await profiles.findById(profile.id)).toEqual({
      ...profile,
      phone: null,
    });
  });
  it('AC-003 no crea ni cambia filas al editar sujeto inexistente', async () => {
    await profiles.createIfAbsent(profile);
    const absent = randomUUID();
    expect(await profiles.findById(absent)).toBeNull();
    expect(
      await profiles.updateActive(absent, { full_name: 'Missing' }, now),
    ).toBeNull();
    expect(await profiles.findById(profile.id)).toEqual(profile);
  });
  it('AC-004 espera suspensión concurrente y rechaza el parche después del commit', async () => {
    await profiles.createIfAbsent(profile);
    const blocker = await database.pool.connect();
    let pending: ReturnType<PgProfileRepository['updateActive']> | undefined;
    try {
      await blocker.query('BEGIN');
      await blocker.query("UPDATE users SET status='suspended' WHERE id=$1", [
        profile.id,
      ]);
      pending = profiles.updateActive(
        profile.id,
        { full_name: 'Forbidden' },
        new Date(now.getTime() + 1000),
      );
      // Wait for PostgreSQL to confirm actual lock contention, not an arbitrary timer.
      await expect
        .poll(async () => {
          const locks = await database.pool.query(
            `SELECT count(*)::int AS n FROM pg_stat_activity
           WHERE datname=current_database() AND pid<>pg_backend_pid()
           AND wait_event_type='Lock' AND query LIKE '%users%'`,
          );
          return locks.rows[0].n;
        })
        .toBeGreaterThan(0);
      await blocker.query('COMMIT');
      expect(await pending).toEqual({ ...profile, status: 'suspended' });
      expect(await profiles.findById(profile.id)).toEqual({
        ...profile,
        status: 'suspended',
      });
    } finally {
      await blocker.query('ROLLBACK');
      blocker.release();
      await pending;
    }
  });
});
