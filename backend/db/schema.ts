// Adaptación del modelo aportado. Excepciones autorizadas: docs/decisions/DB-001.md y DB-002.md.
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  integer,
  pgTable,
  text,
  timestamp,
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
);

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
);

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
);

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
);

export const roles = pgTable(
  'roles',
  {
    id: uuid('id').primaryKey().notNull(),
    rol_type: varchar('rol_type', { length: 30 }).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  () => [
    check(
      'roles_rol_type_check',
      sql`rol_type IN ('owner', 'admin', 'employee')`,
    ),
  ],
);

export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey().notNull(),
    user_id: uuid('user_id').notNull(),
    program_id: uuid('program_id').notNull(),
    status: varchar('status', { length: 20 }).notNull(),
    joined_at: timestamp('joined_at', { withTimezone: true }).notNull(),
  },
  (table) => [
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
);

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
);

export const loyalty_cards = pgTable(
  'loyalty_cards',
  {
    id: uuid('id').primaryKey().notNull(),
    membership_id: uuid('membership_id').notNull().unique(),
    qr_token_hash: text('qr_token_hash').notNull().unique(),
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
);

export const purchases = pgTable(
  'purchases',
  {
    id: uuid('id').primaryKey().notNull(),
    membership_id: uuid('membership_id').notNull(),
    employee_id: uuid('employee_id').notNull(),
    location_id: uuid('location_id').notNull(),
    stamps_earned: integer('stamps_earned').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
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
);

export const loyalty_ledger_entries = pgTable(
  'loyalty_ledger_entries',
  {
    id: uuid('id').primaryKey().notNull(),
    membership_id: uuid('membership_id').notNull(),
    purchase_id: uuid('purchase_id'),
    reward_id: uuid('reward_id'),
    stamp_delta: integer('stamp_delta').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }),
  },
  (table) => [
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
);

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
  },
  (table) => [
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
);
