import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { AppError } from '../application/errors.js';

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}

export function commandFingerprint(
  operation: string,
  payload: unknown,
): string {
  return createHash('sha256')
    .update(JSON.stringify(canonical({ operation, payload })))
    .digest('hex');
}

export function requireIdempotencyKey(value: string | undefined): string {
  if (!value || !/^[\x21-\x7e]{1,255}$/.test(value))
    throw new AppError(
      400,
      'INVALID_IDEMPOTENCY_KEY',
      'Se requiere Idempotency-Key de 1 a 255 caracteres sin espacios.',
    );
  return value;
}

export async function withTransaction<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === '23505'
    )
      throw new AppError(409, 'CONFLICT', 'El registro ya existe.');
    throw error;
  } finally {
    client.release();
  }
}

export async function lockActor(client: PoolClient, id: string) {
  const result = await client.query<{
    id: string;
    email: string | null;
    status: string;
  }>('SELECT id,email,status FROM users WHERE id=$1 FOR SHARE', [id]);
  const actor = result.rows[0];
  if (!actor)
    throw new AppError(404, 'PROFILE_NOT_FOUND', 'No existe el perfil.');
  if (actor.status !== 'active')
    throw new AppError(403, 'PROFILE_INACTIVE', 'El perfil no está activo.');
  return actor;
}

export async function lockRestaurant(client: PoolClient, id: string) {
  const result = await client.query<{
    id: string;
    name: string;
    slug: string;
    status: string;
  }>('SELECT * FROM restaurants WHERE id=$1 FOR UPDATE', [id]);
  const restaurant = result.rows[0];
  if (!restaurant)
    throw new AppError(404, 'NOT_FOUND', 'No existe el restaurante.');
  return restaurant;
}

export interface IdempotentCommand {
  actorId: string;
  key: string;
  operation: string;
  payload: unknown;
}

export async function idempotent<T>(
  client: PoolClient,
  command: IdempotentCommand,
  work: () => Promise<T>,
): Promise<T> {
  requireIdempotencyKey(command.key);
  const fingerprint = commandFingerprint(command.operation, command.payload);
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `${command.actorId}:${command.key}`,
  ]);
  const existing = await client.query<{ fingerprint: string; result: T }>(
    'SELECT fingerprint,result FROM idempotency_records WHERE actor_id=$1 AND key=$2',
    [command.actorId, command.key],
  );
  const record = existing.rows[0];
  if (record) {
    if (record.fingerprint !== fingerprint)
      throw new AppError(
        409,
        'IDEMPOTENCY_CONFLICT',
        'La clave ya fue usada con otro contenido.',
      );
    return record.result;
  }
  const result = await work();
  await client.query(
    'INSERT INTO idempotency_records(id,actor_id,key,fingerprint,result,created_at) VALUES($1,$2,$3,$4,$5,now())',
    [
      randomUUID(),
      command.actorId,
      command.key,
      fingerprint,
      JSON.stringify(result),
    ],
  );
  return result;
}
