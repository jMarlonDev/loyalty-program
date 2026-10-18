CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_id" uuid NOT NULL,
	"restaurant_id" uuid,
	"action" varchar(100) NOT NULL,
	"resource_id" uuid NOT NULL,
	"request_id" text NOT NULL,
	"details" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "closure_consents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"card_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"benefits_version" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "closure_consents_benefits_version_check" CHECK (benefits_version >= 0)
);
--> statement-breakpoint
CREATE TABLE "idempotency_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_id" uuid NOT NULL,
	"key" varchar(255) NOT NULL,
	"fingerprint" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "idempotency_records_actor_key_unique" UNIQUE("actor_id","key")
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"email" varchar(255) NOT NULL,
	"role_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"status" varchar(20) NOT NULL,
	"invited_by" uuid NOT NULL,
	"accepted_by" uuid,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "invitations_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "invitations_status_check" CHECK (status IN ('pending', 'accepted', 'revoked'))
);
--> statement-breakpoint
CREATE TABLE "reward_purchase_allocations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reward_id" uuid NOT NULL,
	"purchase_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "reward_purchase_allocations_reward_purchase_unique" UNIQUE("reward_id","purchase_id")
);
--> statement-breakpoint
ALTER TABLE "loyalty_cards" ADD COLUMN "qr_token_encrypted" text;--> statement-breakpoint
ALTER TABLE "loyalty_ledger_entries" ADD COLUMN "kind" varchar(30);--> statement-breakpoint
ALTER TABLE "loyalty_ledger_entries" ADD COLUMN "actor_id" uuid;--> statement-breakpoint
ALTER TABLE "loyalty_ledger_entries" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "loyalty_ledger_entries" ADD COLUMN "request_id" text;--> statement-breakpoint
ALTER TABLE "loyalty_programs" ADD COLUMN "terms_locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "loyalty_programs" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "loyalty_programs" ADD COLUMN "background_color" varchar(7);--> statement-breakpoint
ALTER TABLE "loyalty_programs" ADD COLUMN "text_color" varchar(7);--> statement-breakpoint
ALTER TABLE "loyalty_programs" ADD COLUMN "card_message" varchar(160);--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "benefits_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "sale_reference" varchar(100);--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "reversed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "reversal_reason" text;--> statement-breakpoint
ALTER TABLE "rewards" ADD COLUMN "redeemed_location_id" uuid;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "fk_audit_actor" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "fk_audit_restaurant" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "closure_consents" ADD CONSTRAINT "fk_consents_card" FOREIGN KEY ("card_id") REFERENCES "public"."loyalty_cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "closure_consents" ADD CONSTRAINT "fk_consents_user" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_records" ADD CONSTRAINT "fk_idempotency_actor" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "fk_invitations_restaurant" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "fk_invitations_role" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "fk_invitations_issuer" FOREIGN KEY ("invited_by") REFERENCES "public"."restaurant_employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "fk_invitations_acceptor" FOREIGN KEY ("accepted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_id_membership_unique" UNIQUE("id","membership_id");--> statement-breakpoint
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_id_membership_unique" UNIQUE("id","membership_id");--> statement-breakpoint
ALTER TABLE "reward_purchase_allocations" ADD CONSTRAINT "fk_allocations_reward_membership" FOREIGN KEY ("reward_id","membership_id") REFERENCES "public"."rewards"("id","membership_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_purchase_allocations" ADD CONSTRAINT "fk_allocations_purchase_membership" FOREIGN KEY ("purchase_id","membership_id") REFERENCES "public"."purchases"("id","membership_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reward_purchase_allocations_active_purchase_unique" ON "reward_purchase_allocations" USING btree ("purchase_id") WHERE released_at IS NULL;--> statement-breakpoint
ALTER TABLE "loyalty_ledger_entries" ADD CONSTRAINT "fk_ledger_actor" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_ledger_entries" ADD CONSTRAINT "fk_ledger_purchase_membership" FOREIGN KEY ("purchase_id","membership_id") REFERENCES "public"."purchases"("id","membership_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_ledger_entries" ADD CONSTRAINT "fk_ledger_reward_membership" FOREIGN KEY ("reward_id","membership_id") REFERENCES "public"."rewards"("id","membership_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rewards" ADD CONSTRAINT "fk_rewards_redeemed_location" FOREIGN KEY ("redeemed_location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_open_user_program_unique" ON "memberships" USING btree ("user_id","program_id") WHERE status <> 'closed';--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_location_sale_reference_unique" UNIQUE("location_id","sale_reference");--> statement-breakpoint
ALTER TABLE "restaurant_employees" ADD CONSTRAINT "restaurant_employees_user_restaurant_unique" UNIQUE("user_id","restaurant_id");--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_rol_type_unique" UNIQUE("rol_type");--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_benefits_version_check" CHECK (benefits_version >= 0);
--> statement-breakpoint
UPDATE "loyalty_programs" SET "terms_locked" = true WHERE EXISTS (SELECT 1 FROM "memberships" WHERE "memberships"."program_id" = "loyalty_programs"."id");
