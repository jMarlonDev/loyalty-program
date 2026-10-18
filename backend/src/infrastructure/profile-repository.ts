import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import { users } from '../../db/schema.js';
import type { ProfileRepository } from '../application/identity.js';
import type { Profile, ProfilePatch } from '../domain/identity.js';

const profileColumns = {
  id: users.id,
  full_name: users.full_name,
  email: users.email,
  phone: users.phone,
  status: users.status,
  created_at: users.created_at,
  updated_at: users.updated_at,
};

function profileOf(
  row:
    | typeof users.$inferSelect
    | Omit<typeof users.$inferSelect, 'password_hash'>,
): Profile {
  return {
    id: row.id,
    full_name: row.full_name,
    email: row.email,
    phone: row.phone,
    status: row.status as Profile['status'],
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export class PgProfileRepository implements ProfileRepository {
  private readonly db;
  constructor(pool: Pool) {
    this.db = drizzle(pool);
  }

  async createIfAbsent(profile: Profile) {
    return this.db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(users)
        .values({ ...profile, password_hash: null })
        .onConflictDoNothing({ target: users.id })
        .returning(profileColumns);
      if (inserted) return { profile: profileOf(inserted), created: true };
      const [existing] = await tx
        .select(profileColumns)
        .from(users)
        .where(eq(users.id, profile.id))
        .for('update');
      if (!existing)
        throw new Error('Profile disappeared during registration.');
      return { profile: profileOf(existing), created: false };
    });
  }

  async findById(id: string) {
    const [row] = await this.db
      .select(profileColumns)
      .from(users)
      .where(eq(users.id, id));
    return row ? profileOf(row) : null;
  }

  async updateActive(id: string, patch: ProfilePatch, now: Date) {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select(profileColumns)
        .from(users)
        .where(eq(users.id, id))
        .for('update');
      if (!existing) return null;
      if (existing.status !== 'active') return profileOf(existing);
      const [updated] = await tx
        .update(users)
        .set({ ...patch, updated_at: now })
        .where(and(eq(users.id, id), eq(users.status, 'active')))
        .returning(profileColumns);
      if (!updated) throw new Error('Profile disappeared during update.');
      return profileOf(updated);
    });
  }
}
