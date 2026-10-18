import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import * as schema from '../../db/schema.js';

const tables = Object.values(schema).map(getTableConfig);
describe('DB-003: evolución incremental funcional', () => {
  it('añade persistencia de invitaciones, asignaciones, consentimiento, idempotencia y auditoría', () => {
    expect(tables.map((table) => table.name)).toEqual(
      expect.arrayContaining([
        'invitations',
        'reward_purchase_allocations',
        'closure_consents',
        'idempotency_records',
        'audit_events',
      ]),
    );
  });
  it('conserva metadatos para términos, QR, reversión y entrega', () => {
    for (const [name, fields] of Object.entries({
      loyalty_programs: [
        'terms_locked',
        'logo_url',
        'background_color',
        'text_color',
        'card_message',
      ],
      memberships: ['closed_at', 'benefits_version'],
      loyalty_cards: ['qr_token_encrypted'],
      purchases: ['sale_reference', 'reversed_at', 'reversal_reason'],
      rewards: ['redeemed_location_id'],
      loyalty_ledger_entries: ['kind', 'actor_id', 'reason', 'request_id'],
    })) {
      expect(
        tables
          .find((table) => table.name === name)
          ?.columns.map((column) => column.name),
      ).toEqual(expect.arrayContaining(fields));
    }
  });
});
