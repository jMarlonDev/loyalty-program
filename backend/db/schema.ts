// Modelo histórico DB-001/002 y evolución funcional DB-003.
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
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
    email: varchar('email', { length: 255 }),
    phone: varchar('phone', { length: 255 }),
    owner_user_id: uuid('owner_user_id'),
    status: varchar('status', { length: 20 }).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    check('restaurants_status_check', sql`status IN ('active', 'suspended')`),
    foreignKey({
      name: 'fk_restaurants_owner_user',
      columns: [table.owner_user_id],
      foreignColumns: [users.id],
    })
      .onUpdate('no action')
      .onDelete('no action'),
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
    // BRANCH-001: punto físico visible (p. ej. «Caja principal, primer piso»).
    physical_point: varchar('physical_point', { length: 255 }),
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
    // AUTH-LOCAL-001: contraseña temporal creada por el admin.
    must_change_password: boolean('must_change_password')
      .notNull()
      .default(false),
    status: varchar('status', { length: 20 }).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('users_email_lower_unique')
      .on(sql`lower(${table.email})`)
      .where(sql`${table.email} IS NOT NULL`),
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
    phone: varchar('phone', { length: 32 }),
    status: varchar('status', { length: 20 }).notNull(),
    joined_at: timestamp('joined_at', { withTimezone: true }).notNull(),
    ended_at: timestamp('ended_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull(),
    // NEXT-006: permiso puntual para transferir tarjetas a otro dispositivo.
    can_transfer_cards: boolean('can_transfer_cards').notNull().default(false),
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
    // NEXT-006: reinscripción tras cerrar tarjetas anteriores del mismo teléfono.
    is_reenrollment: boolean('is_reenrollment').notNull().default(false),
    previous_cards_count: integer('previous_cards_count').notNull().default(0),
    close_reason: varchar('close_reason', { length: 40 }),
  },
  (table) => [
    check('memberships_previous_cards_check', sql`previous_cards_count >= 0`),
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
    version: integer('version').notNull().default(0),
    status: varchar('status', { length: 20 }).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      'loyalty_cards_status_check',
      sql`status IN ('active', 'blocked', 'closed')`,
    ),
    check('loyalty_cards_version_check', sql`version >= 0`),
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
    cycle_id: uuid('cycle_id'),
    description: varchar('description', { length: 255 }).notNull(),
    stamps_spent: integer('stamps_spent').notNull(),
    accounting_mode: varchar('accounting_mode', { length: 30 })
      .notNull()
      .default('legacy_debited'),
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
      'rewards_accounting_mode_check',
      sql`accounting_mode IN ('legacy_debited', 'debit_on_redemption')`,
    ),
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
    foreignKey({
      name: 'fk_rewards_cycle',
      columns: [table.cycle_id],
      foreignColumns: [loyalty_cycles.id],
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

// DB-006 / NEXT-005: infraestructura inerte hasta integrar operaciones y worker.
export const card_events_outbox = pgTable(
  'card_events_outbox',
  {
    id: uuid('id').primaryKey().notNull(),
    card_id: uuid('card_id').notNull(),
    version: integer('version').notNull(),
    type: varchar('type', { length: 30 }).notNull(),
    occurred_at: timestamp('occurred_at', { withTimezone: true }).notNull(),
    available_at: timestamp('available_at', { withTimezone: true }).notNull(),
    attempts: integer('attempts').notNull().default(0),
    lease_token: uuid('lease_token'),
    lease_until: timestamp('lease_until', { withTimezone: true }),
    published_at: timestamp('published_at', { withTimezone: true }),
  },
  (table) => [
    unique('card_events_outbox_card_version_unique').on(
      table.card_id,
      table.version,
    ),
    index('card_events_outbox_pending_idx')
      .on(table.available_at, table.lease_until)
      .where(sql`published_at IS NULL`),
    foreignKey({
      name: 'fk_card_events_outbox_card',
      columns: [table.card_id],
      foreignColumns: [loyalty_cards.id],
    })
      .onUpdate('no action')
      .onDelete('no action'),
    check('card_events_outbox_version_check', sql`version > 0`),
    check('card_events_outbox_attempts_check', sql`attempts >= 0`),
    check(
      'card_events_outbox_type_check',
      sql`type IN ('purchase.recorded', 'reward.available', 'reward.redeemed', 'card.changed')`,
    ),
    check(
      'card_events_outbox_lease_token_check',
      sql`(lease_token IS NULL) = (lease_until IS NULL)`,
    ),
  ],
).enableRLS();

// NEXT-001: identidad de cliente por teléfono. El UUID interno es la clave y
// los usuarios heredados se conservan para no perder tarjetas ni historial.
export const customers = pgTable(
  'customers',
  {
    id: uuid('id').primaryKey().notNull(),
    phone: varchar('phone', { length: 32 }).notNull(),
    country: varchar('country', { length: 2 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    phone_verified_at: timestamp('phone_verified_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    unique('customers_phone_unique').on(table.phone),
    check(
      'customers_status_check',
      sql`status IN ('active', 'suspended', 'closed')`,
    ),
    check(
      'customers_country_check',
      sql`country = upper(country) AND length(country) = 2`,
    ),
    check(
      'customers_phone_check',
      sql`phone LIKE '+%' AND length(phone) BETWEEN 8 AND 16`,
    ),
    foreignKey({
      name: 'fk_customers_user',
      columns: [table.id],
      foreignColumns: [users.id],
    })
      .onUpdate('no action')
      .onDelete('no action'),
  ],
).enableRLS();

export const customer_sessions = pgTable(
  'customer_sessions',
  {
    id: uuid('id').primaryKey().notNull(),
    customer_id: uuid('customer_id').notNull(),
    token_hash: text('token_hash').notNull(),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
    revoked_at: timestamp('revoked_at', { withTimezone: true }),
    last_seen_at: timestamp('last_seen_at', { withTimezone: true }).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull(),
    // NEXT-006: sesión de dispositivo ligada a una sola tarjeta.
    card_id: uuid('card_id'),
    user_agent: varchar('user_agent', { length: 255 }),
  },
  (table) => [
    unique('customer_sessions_token_hash_unique').on(table.token_hash),
    index('customer_sessions_card_idx').on(table.card_id),
    foreignKey({
      name: 'fk_customer_sessions_card',
      columns: [table.card_id],
      foreignColumns: [loyalty_cards.id],
    })
      .onUpdate('no action')
      .onDelete('no action'),
    index('customer_sessions_customer_idx').on(
      table.customer_id,
      table.expires_at,
    ),
    foreignKey({
      name: 'fk_customer_sessions_customer',
      columns: [table.customer_id],
      foreignColumns: [customers.id],
    })
      .onUpdate('no action')
      .onDelete('no action'),
  ],
).enableRLS();

export const operator_invitations = pgTable(
  'operator_invitations',
  {
    id: uuid('id').primaryKey().notNull(),
    restaurant_id: uuid('restaurant_id').notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    phone: varchar('phone', { length: 32 }).notNull(),
    token_hash: text('token_hash').notNull(),
    status: varchar('status', { length: 20 }).notNull(),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
    invited_by: uuid('invited_by').notNull(),
    accepted_by: uuid('accepted_by'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull(),
    accepted_at: timestamp('accepted_at', { withTimezone: true }),
    revoked_at: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    unique('operator_invitations_token_hash_unique').on(table.token_hash),
    index('operator_invitations_restaurant_idx').on(
      table.restaurant_id,
      table.status,
    ),
    check(
      'operator_invitations_status_check',
      sql`status IN ('pending', 'accepted', 'revoked', 'expired')`,
    ),
    check(
      'operator_invitations_email_check',
      sql`email = lower(email) AND position('@' in email) > 1`,
    ),
    check(
      'operator_invitations_phone_check',
      sql`phone LIKE '+%' AND length(phone) BETWEEN 8 AND 16`,
    ),
    foreignKey({
      name: 'fk_operator_invitations_restaurant',
      columns: [table.restaurant_id],
      foreignColumns: [restaurants.id],
    })
      .onUpdate('no action')
      .onDelete('no action'),
    foreignKey({
      name: 'fk_operator_invitations_issuer',
      columns: [table.invited_by],
      foreignColumns: [users.id],
    })
      .onUpdate('no action')
      .onDelete('no action'),
    foreignKey({
      name: 'fk_operator_invitations_acceptor',
      columns: [table.accepted_by],
      foreignColumns: [users.id],
    })
      .onUpdate('no action')
      .onDelete('no action'),
  ],
).enableRLS();

export const loyalty_cycles = pgTable(
  'loyalty_cycles',
  {
    id: uuid('id').primaryKey().notNull(),
    membership_id: uuid('membership_id').notNull(),
    number: integer('number').notNull(),
    state: varchar('state', { length: 30 }).notNull(),
    stamps: integer('stamps').notNull(),
    target: integer('target').notNull(),
    opened_at: timestamp('opened_at', { withTimezone: true }).notNull(),
    closed_at: timestamp('closed_at', { withTimezone: true }),
  },
  (table) => [
    unique('loyalty_cycles_membership_number_unique').on(
      table.membership_id,
      table.number,
    ),
    index('loyalty_cycles_open_idx')
      .on(table.membership_id, table.state)
      .where(sql`state <> 'redeemed'`),
    check('loyalty_cycles_number_check', sql`number > 0`),
    check('loyalty_cycles_stamps_check', sql`stamps >= 0`),
    check('loyalty_cycles_target_check', sql`target > 0`),
    check(
      'loyalty_cycles_state_check',
      sql`state IN ('collecting', 'reward_available', 'redeemed')`,
    ),
    foreignKey({
      name: 'fk_loyalty_cycles_membership',
      columns: [table.membership_id],
      foreignColumns: [memberships.id],
    })
      .onUpdate('no action')
      .onDelete('no action'),
  ],
).enableRLS();

export const reward_vouchers = pgTable(
  'reward_vouchers',
  {
    id: uuid('id').primaryKey().notNull(),
    reward_id: uuid('reward_id').notNull(),
    token_hash: text('token_hash').notNull(),
    token_encrypted: text('token_encrypted').notNull(),
    status: varchar('status', { length: 20 }).notNull(),
    version: integer('version').notNull().default(1),
    expires_at: timestamp('expires_at', { withTimezone: true }),
    consumed_at: timestamp('consumed_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    unique('reward_vouchers_token_hash_unique').on(table.token_hash),
    uniqueIndex('reward_vouchers_active_reward_unique')
      .on(table.reward_id)
      .where(sql`status = 'active'`),
    check('reward_vouchers_version_check', sql`version > 0`),
    check(
      'reward_vouchers_status_check',
      sql`status IN ('active', 'consumed', 'revoked', 'expired')`,
    ),
    foreignKey({
      name: 'fk_reward_vouchers_reward',
      columns: [table.reward_id],
      foreignColumns: [rewards.id],
    })
      .onUpdate('no action')
      .onDelete('no action'),
  ],
).enableRLS();

export const reward_deliveries = pgTable(
  'reward_deliveries',
  {
    id: uuid('id').primaryKey().notNull(),
    reward_id: uuid('reward_id').notNull(),
    channel: varchar('channel', { length: 30 }).notNull(),
    status: varchar('status', { length: 20 }).notNull(),
    recipient_phone: varchar('recipient_phone', { length: 32 }).notNull(),
    last_error: text('last_error'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('reward_deliveries_reward_idx').on(table.reward_id, table.created_at),
    check(
      'reward_deliveries_channel_check',
      sql`channel IN ('whatsapp_manual', 'whatsapp_provider')`,
    ),
    check(
      'reward_deliveries_status_check',
      sql`status IN ('not_requested', 'pending', 'accepted', 'delivered', 'failed')`,
    ),
    foreignKey({
      name: 'fk_reward_deliveries_reward',
      columns: [table.reward_id],
      foreignColumns: [rewards.id],
    })
      .onUpdate('no action')
      .onDelete('no action'),
  ],
).enableRLS();

// Las conexiones WebSocket se cuentan fuera de memoria para respetar el
// límite entre procesos cuando el despliegue use más de una instancia.
export const customer_event_leases = pgTable(
  'customer_event_leases',
  {
    lease_token: uuid('lease_token').primaryKey().notNull(),
    session_id: uuid('session_id').notNull(),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('customer_event_leases_session_idx').on(
      table.session_id,
      table.expires_at,
    ),
    foreignKey({
      name: 'fk_customer_event_leases_session',
      columns: [table.session_id],
      foreignColumns: [customer_sessions.id],
    })
      .onUpdate('no action')
      .onDelete('no action'),
  ],
).enableRLS();

// NEXT-006: transferencia de tarjeta a un dispositivo nuevo, de un solo uso.
export const card_transfers = pgTable(
  'card_transfers',
  {
    id: uuid('id').primaryKey().notNull(),
    card_id: uuid('card_id').notNull(),
    token_hash: text('token_hash').notNull(),
    created_by: uuid('created_by').notNull(),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumed_at: timestamp('consumed_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    unique('card_transfers_token_hash_unique').on(table.token_hash),
    index('card_transfers_card_idx').on(table.card_id),
    foreignKey({
      name: 'fk_card_transfers_card',
      columns: [table.card_id],
      foreignColumns: [loyalty_cards.id],
    })
      .onUpdate('no action')
      .onDelete('no action'),
    foreignKey({
      name: 'fk_card_transfers_creator',
      columns: [table.created_by],
      foreignColumns: [users.id],
    })
      .onUpdate('no action')
      .onDelete('no action'),
  ],
).enableRLS();

// NEXT-006: intentos de inscripción para limitar por IP y dispositivo (hash).
export const enrollment_attempts = pgTable(
  'enrollment_attempts',
  {
    id: uuid('id').primaryKey().notNull(),
    scope: varchar('scope', { length: 10 }).notNull(),
    key_hash: text('key_hash').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('enrollment_attempts_lookup_idx').on(
      table.scope,
      table.key_hash,
      table.created_at,
    ),
    check(
      'enrollment_attempts_scope_check',
      sql`scope IN ('ip', 'device', 'login')`,
    ),
  ],
).enableRLS();

// AUTH-LOCAL-001: sesiones de admin/empleado con tokens opacos (solo hash).
export const staff_sessions = pgTable(
  'staff_sessions',
  {
    id: uuid('id').primaryKey().notNull(),
    user_id: uuid('user_id').notNull(),
    access_hash: text('access_hash').notNull(),
    access_expires_at: timestamp('access_expires_at', {
      withTimezone: true,
    }).notNull(),
    refresh_hash: text('refresh_hash').notNull(),
    refresh_expires_at: timestamp('refresh_expires_at', {
      withTimezone: true,
    }).notNull(),
    revoked_at: timestamp('revoked_at', { withTimezone: true }),
    user_agent: varchar('user_agent', { length: 255 }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull(),
    last_seen_at: timestamp('last_seen_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    unique('staff_sessions_access_hash_unique').on(table.access_hash),
    unique('staff_sessions_refresh_hash_unique').on(table.refresh_hash),
    index('staff_sessions_user_idx').on(table.user_id),
    foreignKey({
      name: 'fk_staff_sessions_user',
      columns: [table.user_id],
      foreignColumns: [users.id],
    })
      .onUpdate('no action')
      .onDelete('no action'),
  ],
).enableRLS();

// BRANCH-001: un empleado solo opera en las sucursales asignadas.
export const employee_locations = pgTable(
  'employee_locations',
  {
    employee_id: uuid('employee_id').notNull(),
    location_id: uuid('location_id').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({
      name: 'employee_locations_pk',
      columns: [table.employee_id, table.location_id],
    }),
    index('employee_locations_location_idx').on(table.location_id),
    foreignKey({
      name: 'fk_employee_locations_employee',
      columns: [table.employee_id],
      foreignColumns: [restaurant_employees.id],
    })
      .onUpdate('no action')
      .onDelete('no action'),
    foreignKey({
      name: 'fk_employee_locations_location',
      columns: [table.location_id],
      foreignColumns: [locations.id],
    })
      .onUpdate('no action')
      .onDelete('no action'),
  ],
).enableRLS();

// BRANCH-001: QR de invitación por sucursal, con vencimiento, límite de usos y
// renovación (revocar + emitir otro). Solo se guarda el hash del token.
export const branch_invitations = pgTable(
  'branch_invitations',
  {
    id: uuid('id').primaryKey().notNull(),
    restaurant_id: uuid('restaurant_id').notNull(),
    location_id: uuid('location_id').notNull(),
    token_hash: text('token_hash').notNull(),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
    max_uses: integer('max_uses').notNull(),
    uses: integer('uses').notNull().default(0),
    revoked_at: timestamp('revoked_at', { withTimezone: true }),
    replaced_by: uuid('replaced_by'),
    created_by: uuid('created_by').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    unique('branch_invitations_token_hash_unique').on(table.token_hash),
    index('branch_invitations_location_idx').on(table.location_id),
    check(
      'branch_invitations_uses_check',
      sql`max_uses BETWEEN 1 AND 50 AND uses >= 0 AND uses <= max_uses`,
    ),
    foreignKey({
      name: 'fk_branch_invitations_restaurant',
      columns: [table.restaurant_id],
      foreignColumns: [restaurants.id],
    })
      .onUpdate('no action')
      .onDelete('no action'),
    foreignKey({
      name: 'fk_branch_invitations_location',
      columns: [table.location_id],
      foreignColumns: [locations.id],
    })
      .onUpdate('no action')
      .onDelete('no action'),
    foreignKey({
      name: 'fk_branch_invitations_creator',
      columns: [table.created_by],
      foreignColumns: [users.id],
    })
      .onUpdate('no action')
      .onDelete('no action'),
  ],
).enableRLS();
