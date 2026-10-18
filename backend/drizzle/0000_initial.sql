CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"phone" varchar(255),
	"address" text NOT NULL,
	"city" varchar(255) NOT NULL,
	"department" varchar(255) NOT NULL,
	"status" varchar(20) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "locations_status_check" CHECK (status IN ('active', 'inactive'))
);
--> statement-breakpoint
CREATE TABLE "loyalty_cards" (
	"id" uuid PRIMARY KEY NOT NULL,
	"membership_id" uuid NOT NULL,
	"qr_token_hash" text NOT NULL,
	"status" varchar(20) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "loyalty_cards_membership_id_unique" UNIQUE("membership_id"),
	CONSTRAINT "loyalty_cards_qr_token_hash_unique" UNIQUE("qr_token_hash"),
	CONSTRAINT "loyalty_cards_status_check" CHECK (status IN ('active', 'blocked'))
);
--> statement-breakpoint
CREATE TABLE "loyalty_ledger_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"membership_id" uuid NOT NULL,
	"purchase_id" uuid,
	"reward_id" uuid,
	"stamp_delta" integer NOT NULL,
	"created_at" timestamp with time zone,
	CONSTRAINT "loyalty_ledger_entries_stamp_delta_check" CHECK (stamp_delta <> 0)
);
--> statement-breakpoint
CREATE TABLE "loyalty_programs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" varchar(255),
	"public_code" varchar(255) NOT NULL,
	"stamps_required" integer NOT NULL,
	"reward_description" varchar(255) NOT NULL,
	"status" varchar(20) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "loyalty_programs_public_code_unique" UNIQUE("public_code"),
	CONSTRAINT "loyalty_programs_stamps_required_check" CHECK (stamps_required > 0),
	CONSTRAINT "loyalty_programs_status_check" CHECK (status IN ('active', 'paused', 'ended'))
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"status" varchar(20) NOT NULL,
	"joined_at" timestamp with time zone NOT NULL,
	CONSTRAINT "memberships_status_check" CHECK (status IN ('active', 'suspended', 'closed'))
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"membership_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"stamps_earned" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "purchases_stamps_earned_check" CHECK (stamps_earned > 0)
);
--> statement-breakpoint
CREATE TABLE "restaurant_employees" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"status" varchar(20) NOT NULL,
	"joined_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "restaurant_employees_status_check" CHECK (status IN ('active', 'suspended', 'disabled' ))
);
--> statement-breakpoint
CREATE TABLE "restaurants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"email" varchar(255),
	"phone" varchar(255),
	"status" varchar(20) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "restaurants_slug_unique" UNIQUE("slug"),
	CONSTRAINT "restaurants_status_check" CHECK (status IN ('active', 'suspended'))
);
--> statement-breakpoint
CREATE TABLE "rewards" (
	"id" uuid PRIMARY KEY NOT NULL,
	"membership_id" uuid NOT NULL,
	"description" varchar(255) NOT NULL,
	"stamps_spent" integer NOT NULL,
	"status" varchar(255) NOT NULL,
	"earned_at" timestamp with time zone NOT NULL,
	"redeemed_at" timestamp with time zone,
	"redeemed_by" uuid,
	CONSTRAINT "rewards_stamps_spent_check" CHECK (stamps_spent > 0),
	CONSTRAINT "rewards_status_check" CHECK (status IN ('available', 'redeemed', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"rol_type" varchar(30) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "roles_rol_type_check" CHECK (rol_type IN ('owner', 'admin', 'employee'))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"email" varchar(255),
	"phone" varchar(20),
	"password_hash" text,
	"status" varchar(20) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "users_status_check" CHECK (status IN ('active', 'suspended', 'closed'))
);
--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "fk_restaurant_location" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_cards" ADD CONSTRAINT "fk_loyalty_cards_membership" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_ledger_entries" ADD CONSTRAINT "fk_loyalty_entries_membership" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_ledger_entries" ADD CONSTRAINT "fk_loyalty_ledger_purchases" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_ledger_entries" ADD CONSTRAINT "fk_rewards_loyalty_ledger_entries" FOREIGN KEY ("reward_id") REFERENCES "public"."rewards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_programs" ADD CONSTRAINT "fk_loyalty_programs_restaurant" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "fk_membership_user" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "fk_memberships_loyalty_programs" FOREIGN KEY ("program_id") REFERENCES "public"."loyalty_programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "fk_purchases_memberships" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "fk_purchases_employee" FOREIGN KEY ("employee_id") REFERENCES "public"."restaurant_employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "fk_purchases_location" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_employees" ADD CONSTRAINT "fk_employee_user" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_employees" ADD CONSTRAINT "fk_employee_restaurant" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_employees" ADD CONSTRAINT "fk_roles_restaurant_employee" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rewards" ADD CONSTRAINT "fk_rewards_restaurant_employees" FOREIGN KEY ("redeemed_by") REFERENCES "public"."restaurant_employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rewards" ADD CONSTRAINT "fk_rewards_memberships" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;