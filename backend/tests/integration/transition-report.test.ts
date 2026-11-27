import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { collectTransitionReport } from '../../scripts/transition-report.js';
import {
  fixture,
  snapshot,
  sourceDatabase,
} from '../helpers/transition-fixture.js';

describe('DATA-NEXT-001: snapshot PostgreSQL 0004', () => {
  it('AC-002/003/004 reporta conflictos y preserva premios ya debitados, excedentes e identidades', async () => {
    const database = await sourceDatabase();
    try {
      const ids = await fixture(database);
      const before = await snapshot(database);
      const client = await database.pool.connect();
      let report: Awaited<ReturnType<typeof collectTransitionReport>>;
      try {
        report = await collectTransitionReport(client);
        expect(await collectTransitionReport(client)).toEqual(report);
      } finally {
        client.release();
      }
      expect(report.counts).toMatchObject({
        users: 4,
        purchases: 4,
        rewards: 1,
        memberships: 4,
      });
      expect(report.memberships).toContainEqual(
        expect.objectContaining({
          membershipId: ids.membership,
          balance: 1,
          purchases: 4,
          availableRewards: 1,
        }),
      );
      expect(report.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'canonical_phone_collision',
            entityIds: [ids.owner, ids.customer].sort(),
          }),
          expect.objectContaining({
            code: 'owner_ambiguous',
            entityIds: [ids.restaurant],
          }),
          expect.objectContaining({
            code: 'customer_phone_missing',
            entityIds: [ids.otherOwner],
          }),
          expect.objectContaining({
            code: 'customer_phone_noncanonical',
            entityIds: [ids.admin],
          }),
          expect.objectContaining({
            code: 'legacy_reward_already_debited',
            entityIds: [ids.reward],
          }),
          expect.objectContaining({
            code: 'legacy_reward_with_remaining_balance',
            entityIds: [ids.membership],
          }),
        ]),
      );
      expect(report.findings.map((finding) => finding.code)).not.toContain(
        'reward_requires_review',
      );
      expect(report.conversionAllowed).toBe(false);
      expect(JSON.stringify(report)).not.toMatch(
        /PRIVATE|private-|private@|573001234567|57 300/,
      );
      expect(await snapshot(database)).toEqual(before);
    } finally {
      await database.cleanup();
    }
  });

  it('AC-003 detecta premio sin débito y saldo negativo sin repararlos automáticamente', async () => {
    const database = await sourceDatabase();
    try {
      const ids = await fixture(database);
      await database.pool.query(
        'DELETE FROM loyalty_ledger_entries WHERE reward_id=$1',
        [ids.reward],
      );
      await database.pool.query(
        "INSERT INTO loyalty_ledger_entries(id,membership_id,stamp_delta,created_at,kind,actor_id,request_id) VALUES($1,$2,-1,now(),'reversal',$3,'private-request')",
        [randomUUID(), ids.mixedMembership, ids.owner],
      );
      const before = await snapshot(database);
      const client = await database.pool.connect();
      try {
        const report = await collectTransitionReport(client);
        expect(report.findings).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              code: 'reward_requires_review',
              entityIds: [ids.reward],
            }),
            expect.objectContaining({
              code: 'negative_balance',
              entityIds: [ids.mixedMembership],
            }),
          ]),
        );
      } finally {
        client.release();
      }
      expect(await snapshot(database)).toEqual(before);
    } finally {
      await database.cleanup();
    }
  });
});
