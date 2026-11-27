import type { Pool } from 'pg';
import type { PgNextRepository } from './next-repository.js';

export function createNextEventAdapters({
  pool,
  repository,
  readToken,
}: {
  pool: Pool;
  repository: PgNextRepository;
  readToken(request: Request): string | undefined;
}) {
  return {
    authorization: {
      async authenticate(request: Request) {
        const token = readToken(request);
        if (!token) return null;
        try {
          const principal = await repository.authenticate(token);
          return {
            sessionId: principal.session_id,
            customerId: principal.user_id,
          };
        } catch {
          return null;
        }
      },
      async isActive(principal: { sessionId: string; customerId: string }) {
        return repository.sessionActive(principal.sessionId);
      },
      async cardAccess(
        principal: { sessionId: string; customerId: string },
        cardId: string,
      ) {
        if (!(await repository.sessionActive(principal.sessionId))) return null;
        const version = await repository.cardAccessVersion(
          principal.customerId,
          cardId,
        );
        return version === null ? null : { version };
      },
    },
    connections: {
      async acquire(sessionId: string, maximum: number) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
            sessionId,
          ]);
          await client.query(
            'DELETE FROM customer_event_leases WHERE expires_at <= now()',
          );
          const { rows } = await client.query<{ total: number }>(
            'SELECT count(*)::int AS total FROM customer_event_leases WHERE session_id=$1',
            [sessionId],
          );
          if ((rows[0]?.total ?? 0) >= maximum) {
            await client.query('ROLLBACK');
            return null;
          }
          const { rows: leases } = await client.query<{ lease_token: string }>(
            `INSERT INTO customer_event_leases(lease_token,session_id,expires_at)
             VALUES(gen_random_uuid(),$1,now()+interval '60 seconds')
             RETURNING lease_token`,
            [sessionId],
          );
          await client.query('COMMIT');
          return leases[0]?.lease_token ?? null;
        } catch (error) {
          await client.query('ROLLBACK').catch(() => undefined);
          throw error;
        } finally {
          client.release();
        }
      },
      async refresh(lease: string) {
        const { rowCount } = await pool.query(
          `UPDATE customer_event_leases SET expires_at=now()+interval '60 seconds'
           WHERE lease_token=$1 AND expires_at > now()`,
          [lease],
        );
        return (rowCount ?? 0) > 0;
      },
      async release(lease: string) {
        await pool.query(
          'DELETE FROM customer_event_leases WHERE lease_token=$1',
          [lease],
        );
      },
    },
  };
}
