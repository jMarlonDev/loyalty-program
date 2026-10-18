// Modelo histórico DB-001/002 y evolución funcional DB-003.
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const restaurants = pgTable(
  'restaurants',
  {
    id: uuid('id').primaryKey().notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull().unique(),
    email: varchar('email', { length: 255 }),
    phone: varchar('phone', { length: 255 }),
    status: varchar('status', { length: 20 }).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  () => [
    check('restaurants_status_check', sql`status IN ('active', 'suspended')`),
  ],
).enableRLS();

export const locations = pgTable(
  'locations',
  {
    id: uuid('id').primaryKey().notNull(),
    restaurant_id: uuid('restaurant_id').notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    phone: varchar('phone', { length: 255 }),
    address: text('address').notNull(),
    city: varchar('city', { length: 255 }).notNull(),
    department: varchar('department', { length: 255 }).notNull(),
    status: varchar('status', { length: 20 }).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    check('locations_status_check', sql`status IN ('active', 'inactive')`),
    foreignKey({
      name: 'fk_restaurant_location',
      columns: [table.restaurant_id],
      foreignColumns: [restaurants.id],
    })
      .onUpdate('no action')
      .onDelete('no action'),
  ],
).enableRLS();

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().notNull(),
    full_name: varchar('full_name', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }),
    phone: varchar('phone', { length: 20 }),
    password_hash: text('password_hash'),
    status: varchar('status', { length: 20 }).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  () => [
    check(
      'users_status_check',
      sql`status IN ('active', 'suspended', 'closed')`,
    ),
  ],
).enableRLS();

export const restaurant_employees = pgTable(
  'restaurant_employees',
  {
    id: uuid('id').primaryKey().notNull(),
    user_id: uuid('user_id').notNull(),
    restaurant_id: uuid('restaurant_id').notNull(),
    role_id: uuid('role_id').notNull(),
    status: varchar('status', { length: 20 }).notNull(),
    joined_at: timestamp('joined_at', { withTimezone: true }).notNull(),
    ended_at: timestamp('ended_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    unique('restaurant_employees_user_restaurant_unique').on(
      table.user_id,
      table.restaurant_id,
    ),
    check(
      'restaurant_employees_status_check',
      sql`status IN ('active', 'suspended', 'disabled' )`,
    ),
    foreignKey({
      name: 'fk_employee_user',
      columns: [table.user_id],
      foreignColumns: [users.id],
    })
      .onUpdate('no action')
      .onDelete('no action'),
    foreignKey({
      name: 'fk_employee_restaurant',
      columns: [table.restaurant_id],
      foreignColumns: [restaurants.id],
    })
      .onUpdate('no action')
      .onDelete('no action'),
    foreignKey({
      name: 'fk_roles_restaurant_employee',
      columns: [table.role_id],
      foreignColumns: [roles.id],
    })
      .onUpdate('no action')
      .onDelete('no action'),
  ],
).enableRLS();

export const roles = pgTable(
  'roles',
  {
    id: uuid('id').primaryKey().notNull(),
    rol_type: varchar('rol_type', { length: 30 }).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    unique('roles_rol_type_unique').on(table.rol_type),
    check(
      'roles_rol_type_check',
      sql`rol_type IN ('owner', 'admin', 'employee')`,
    ),
  ],
).enableRLS();

export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey().notNull(),
    user_id: uuid('user_id').notNull(),
    program_id: uuid('program_id').notNull(),
    status: varchar('status', { length: 20 }).notNull(),
    joined_at: timestamp('joined_at', { withTimezone: true }).notNull(),
    closed_at: timestamp('closed_at', { withTimezone: true }),
    benefits_version: integer('benefits_version').notNull().default(0),
  },
  (table) => [
    uniqueIndex('memberships_open_user_program_unique')
      .on(table.user_id, table.program_id)
      .where(sql`status <> 'closed'`),
    check('memberships_benefits_version_check', sql`benefits_version >= 0`),
    check(
      'memberships_status_check',
      sql`status IN ('active', 'suspended', 'closed')`,
    ),
    foreignKey({
      name: 'fk_membership_user',
      columns: [table.user_id],
      foreignColumns: [users.id],
    })
      .onUpdate('no action')
      .onDelete('no action'),
    foreignKey({
      name: 'fk_memberships_loyalty_programs',
      columns: [table.program_id],
      foreignColumns: [loyalty_programs.id],
    })
      .onUpdate('no action')
      .onDelete('no action'),
  ],
).enableRLS();

export const loyalty_programs = pgTable(
  'loyalty_programs',
  {
    id: uuid('id').primaryKey().notNull(),
    restaurant_id: uuid('restaurant_id').notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    description: varchar('description', { length: 255 }),
    public_code: varchar('public_code', { length: 255 }).notNull().unique(),
    stamps_required: integer('stamps_required').notNull(),
    reward_description: varchar('reward_description', {
      length: 255,
    }).notNull(),
    status: varchar('status', { length: 20 }).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull(),
    terms_locked: boolean('terms_locked').notNull().default(false),
    logo_url: text('logo_url'),
    background_color: varchar('background_color', { length: 7 }),
    text_color: varchar('text_color', { length: 7 }),
    card_message: varchar('card_message', { length: 160 }),
  },
  (table) => [
    check('loyalty_programs_stamps_required_check', sql`stamps_required > 0`),
    check(
      'loyalty_programs_status_check',
      sql`status IN ('active', 'paused', 'ended')`,
    ),
    foreignKey({
      name: 'fk_loyalty_programs_restaurant',
      columns: [table.restaurant_id],
      foreignColumns: [restaurants.id],
    })
      .onUpdate('no action')
      .onDelete('no action'),
  ],
).enableRLS();

export const loyalty_cards = pgTable(
  'loyalty_cards',
  {
    id: uuid('id').primaryKey().notNull(),
    membership_id: uuid('membership_id').notNull().unique(),
    qr_token_hash: text('qr_token_hash').notNull().unique(),
    qr_token_encrypted: text('qr_token_encrypted'),
    status: varchar('status', { length: 20 }).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    check('loyalty_cards_status_check', sql`status IN ('active', 'blocked')`),
    foreignKey({
      name: 'fk_loyalty_cards_membership',
      columns: [table.membership_id],
      foreignColumns: [memberships.id],
    })
      .onUpdate('no action')
      .onDelete('no action'),
  ],
).enableRLS();

export const purchases = pgTable(
  'purchases',
  {
    id: uuid('id').primaryKey().notNull(),
    membership_id: uuid('membership_id').notNull(),
    employee_id: uuid('employee_id').notNull(),
    location_id: uuid('location_id').notNull(),
    stamps_earned: integer('stamps_earned').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull(),
    sale_reference: varchar('sale_reference', { length: 100 }),
    reversed_at: timestamp('reversed_at', { withTimezone: true }),
    reversal_reason: text('reversal_reason'),
  },
  (table) => [
    unique('purchases_location_sale_reference_unique').on(
      table.location_id,
      table.sale_reference,
    ),
    unique('purchases_id_membership_unique').on(table.id, table.membership_id),
    check('purchases_stamps_earned_check', sql`stamps_earned > 0`),
    foreignKey({
      name: 'fk_purchases_memberships',
      columns: [table.membership_id],
      foreignColumns: [memberships.id],
    })
      .onUpdate('no action')
      .onDelete('no action'),
    foreignKey({
      name: 'fk_purchases_employee',
      columns: [table.employee_id],
      foreignColumns: [restaurant_employees.id],
    })
      .onUpdate('no action')
      .onDelete('no action'),
    foreignKey({
      name: 'fk_purchases_location',
      columns: [table.location_id],
      foreignColumns: [locations.id],
    })
      .onUpdate('no action')
      .onDelete('no action'),
  ],
).enableRLS();

export const loyalty_ledger_entries = pgTable(
  'loyalty_ledger_entries',
  {
    id: uuid('id').primaryKey().notNull(),
    membership_id: uuid('membership_id').notNull(),
    purchase_id: uuid('purchase_id'),
    reward_id: uuid('reward_id'),
    stamp_delta: integer('stamp_delta').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }),
    kind: varchar('kind', { length: 30 }),
    actor_id: uuid('actor_id'),
    reason: text('reason'),
    request_id: text('request_id'),
  },
  (table) => [
    foreignKey({
      name: 'fk_ledger_actor',
      columns: [table.actor_id],
      foreignColumns: [users.id],
    })
      .onDelete('no action')
      .onUpdate('no action'),
    foreignKey({
      name: 'fk_ledger_purchase_membership',
      columns: [table.purchase_id, table.membership_id],
      foreignColumns: [purchases.id, purchases.membership_id],
    })
      .onDelete('no action')
      .onUpdate('no action'),
    foreignKey({
      name: 'fk_ledger_reward_membership',
      columns: [table.reward_id, table.membership_id],
      foreignColumns: [rewards.id, rewards.membership_id],
    })
      .onDelete('no action')
      .onUpdate('no action'),
    check('loyalty_ledger_entries_stamp_delta_check', sql`stamp_delta <> 0`),
    foreignKey({
      name: 'fk_loyalty_entries_membership',
      columns: [table.membership_id],
      foreignColumns: [memberships.id],
    })
      .onUpdate('no action')
      .onDelete('no action'),
    foreignKey({
      name: 'fk_loyalty_ledger_purchases',
      columns: [table.purchase_id],
      foreignColumns: [purchases.id],
    })
      .onUpdate('no action')
      .onDelete('no action'),
    foreignKey({
      name: 'fk_rewards_loyalty_ledger_entries',
      columns: [table.reward_id],
      foreignColumns: [rewards.id],
    })
      .onUpdate('no action')
      .onDelete('no action'),
  ],
).enableRLS();

export const rewards = pgTable(
  'rewards',
  {
    id: uuid('id').primaryKey().notNull(),
    membership_id: uuid('membership_id').notNull(),
    description: varchar('description', { length: 255 }).notNull(),
    stamps_spent: integer('stamps_spent').notNull(),
    status: varchar('status', { length: 255 }).notNull(),
    earned_at: timestamp('earned_at', { withTimezone: true }).notNull(),
    redeemed_at: timestamp('redeemed_at', { withTimezone: true }),
    redeemed_by: uuid('redeemed_by'),
    redeemed_location_id: uuid('redeemed_location_id'),
  },
  (table) => [
    unique('rewards_id_membership_unique').on(table.id, table.membership_id),
    foreignKey({
      name: 'fk_rewards_redeemed_location',
      columns: [table.redeemed_location_id],
      foreignColumns: [locations.id],
    })
      .onDelete('no action')
      .onUpdate('no action'),
    check('rewards_stamps_spent_check', sql`stamps_spent > 0`),
    check(
      'rewards_status_check',
      sql`status IN ('available', 'redeemed', 'cancelled')`,
    ),
    foreignKey({
      name: 'fk_rewards_restaurant_employees',
      columns: [table.redeemed_by],
      foreignColumns: [restaurant_employees.id],
    })
      .onUpdate('no action')
      .onDelete('no action'),
    foreignKey({
      name: 'fk_rewards_memberships',
      columns: [table.membership_id],
      foreignColumns: [memberships.id],
    })
      .onUpdate('no action')
      .onDelete('no action'),
  ],
).enableRLS();

export const invitations = pgTable(
  'invitations',
  {
    id: uuid('id').primaryKey().notNull(),
    restaurant_id: uuid('restaurant_id').notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    role_id: uuid('role_id').notNull(),
    token_hash: text('token_hash').notNull().unique(),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
    status: varchar('status', { length: 20 }).notNull(),
    invited_by: uuid('invited_by').notNull(),
    accepted_by: uuid('accepted_by'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      'invitations_status_check',
      sql`status IN ('pending', 'accepted', 'revoked')`,
    ),
    foreignKey({
      name: 'fk_invitations_restaurant',
      columns: [table.restaurant_id],
      foreignColumns: [restaurants.id],
    })
      .onDelete('no action')
      .onUpdate('no action'),
    foreignKey({
      name: 'fk_invitations_role',
      columns: [table.role_id],
      foreignColumns: [roles.id],
    })
      .onDelete('no action')
      .onUpdate('no action'),
    foreignKey({
      name: 'fk_invitations_issuer',
      columns: [table.invited_by],
      foreignColumns: [restaurant_employees.id],
    })
      .onDelete('no action')
      .onUpdate('no action'),
    foreignKey({
      name: 'fk_invitations_acceptor',
      columns: [table.accepted_by],
      foreignColumns: [users.id],
    })
      .onDelete('no action')
      .onUpdate('no action'),
  ],
).enableRLS();

export const reward_purchase_allocations = pgTable(
  'reward_purchase_allocations',
  {
    id: uuid('id').primaryKey().notNull(),
    reward_id: uuid('reward_id').notNull(),
    purchase_id: uuid('purchase_id').notNull(),
    membership_id: uuid('membership_id').notNull(),
    released_at: timestamp('released_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    unique('reward_purchase_allocations_reward_purchase_unique').on(
      table.reward_id,
      table.purchase_id,
    ),
    uniqueIndex('reward_purchase_allocations_active_purchase_unique')
      .on(table.purchase_id)
      .where(sql`released_at IS NULL`),
    foreignKey({
      name: 'fk_allocations_reward_membership',
      columns: [table.reward_id, table.membership_id],
      foreignColumns: [rewards.id, rewards.membership_id],
    })
      .onDelete('no action')
      .onUpdate('no action'),
    foreignKey({
      name: 'fk_allocations_purchase_membership',
      columns: [table.purchase_id, table.membership_id],
      foreignColumns: [purchases.id, purchases.membership_id],
    })
      .onDelete('no action')
      .onUpdate('no action'),
  ],
).enableRLS();

export const closure_consents = pgTable(
  'closure_consents',
  {
    id: uuid('id').primaryKey().notNull(),
    card_id: uuid('card_id').notNull(),
    user_id: uuid('user_id').notNull(),
    benefits_version: integer('benefits_version').notNull(),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
    revoked_at: timestamp('revoked_at', { withTimezone: true }),
    consumed_at: timestamp('consumed_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      'closure_consents_benefits_version_check',
      sql`benefits_version >= 0`,
    ),
    foreignKey({
      name: 'fk_consents_card',
      columns: [table.card_id],
      foreignColumns: [loyalty_cards.id],
    })
      .onDelete('no action')
      .onUpdate('no action'),
    foreignKey({
      name: 'fk_consents_user',
      columns: [table.user_id],
      foreignColumns: [users.id],
    })
      .onDelete('no action')
      .onUpdate('no action'),
  ],
).enableRLS();

export const idempotency_records = pgTable(
  'idempotency_records',
  {
    id: uuid('id').primaryKey().notNull(),
    actor_id: uuid('actor_id').notNull(),
    key: varchar('key', { length: 255 }).notNull(),
    fingerprint: text('fingerprint').notNull(),
    result: jsonb('result').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    unique('idempotency_records_actor_key_unique').on(
      table.actor_id,
      table.key,
    ),
    foreignKey({
      name: 'fk_idempotency_actor',
      columns: [table.actor_id],
      foreignColumns: [users.id],
    })
      .onDelete('no action')
      .onUpdate('no action'),
  ],
).enableRLS();

export const audit_events = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey().notNull(),
    actor_id: uuid('actor_id').notNull(),
    restaurant_id: uuid('restaurant_id'),
    action: varchar('action', { length: 100 }).notNull(),
    resource_id: uuid('resource_id').notNull(),
    request_id: text('request_id').notNull(),
    details: jsonb('details').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    foreignKey({
      name: 'fk_audit_actor',
      columns: [table.actor_id],
      foreignColumns: [users.id],
    })
      .onDelete('no action')
      .onUpdate('no action'),
    foreignKey({
      name: 'fk_audit_restaurant',
      columns: [table.restaurant_id],
      foreignColumns: [restaurants.id],
    })
      .onDelete('no action')
      .onUpdate('no action'),
  ],
).enableRLS();
