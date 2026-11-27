CREATE TABLE "customer_event_leases" (
	"lease_token" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer_event_leases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "customer_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"customer_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "customer_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "customer_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"phone" varchar(32) NOT NULL,
	"country" varchar(2) NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"phone_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "customers_phone_unique" UNIQUE("phone"),
	CONSTRAINT "customers_status_check" CHECK (status IN ('active', 'suspended', 'closed')),
	CONSTRAINT "customers_country_check" CHECK (country = upper(country) AND length(country) = 2),
	CONSTRAINT "customers_phone_check" CHECK (phone LIKE '+%' AND length(phone) BETWEEN 8 AND 16)
);
--> statement-breakpoint
ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "loyalty_cycles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"membership_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"state" varchar(30) NOT NULL,
	"stamps" integer NOT NULL,
	"target" integer NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "loyalty_cycles_membership_number_unique" UNIQUE("membership_id","number"),
	CONSTRAINT "loyalty_cycles_number_check" CHECK (number > 0),
	CONSTRAINT "loyalty_cycles_stamps_check" CHECK (stamps >= 0),
	CONSTRAINT "loyalty_cycles_target_check" CHECK (target > 0),
	CONSTRAINT "loyalty_cycles_state_check" CHECK (state IN ('collecting', 'reward_available', 'redeemed'))
);
--> statement-breakpoint
ALTER TABLE "loyalty_cycles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "operator_invitations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"email" varchar(255) NOT NULL,
	"phone" varchar(32) NOT NULL,
	"token_hash" text NOT NULL,
	"status" varchar(20) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"invited_by" uuid NOT NULL,
	"accepted_by" uuid,
	"created_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "operator_invitations_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "operator_invitations_status_check" CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
	CONSTRAINT "operator_invitations_email_check" CHECK (email = lower(email) AND position('@' in email) > 1),
	CONSTRAINT "operator_invitations_phone_check" CHECK (phone LIKE '+%' AND length(phone) BETWEEN 8 AND 16)
);
--> statement-breakpoint
ALTER TABLE "operator_invitations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "reward_deliveries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reward_id" uuid NOT NULL,
	"channel" varchar(30) NOT NULL,
	"status" varchar(20) NOT NULL,
	"recipient_phone" varchar(32) NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "reward_deliveries_channel_check" CHECK (channel IN ('whatsapp_manual', 'whatsapp_provider')),
	CONSTRAINT "reward_deliveries_status_check" CHECK (status IN ('not_requested', 'pending', 'accepted', 'delivered', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "reward_deliveries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "reward_vouchers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reward_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"token_encrypted" text NOT NULL,
	"status" varchar(20) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"expires_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "reward_vouchers_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "reward_vouchers_version_check" CHECK (version > 0),
	CONSTRAINT "reward_vouchers_status_check" CHECK (status IN ('active', 'consumed', 'revoked', 'expired'))
);
--> statement-breakpoint
ALTER TABLE "reward_vouchers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "restaurant_employees" ADD COLUMN "phone" varchar(32);--> statement-breakpoint
ALTER TABLE "rewards" ADD COLUMN "cycle_id" uuid;--> statement-breakpoint
ALTER TABLE "customer_event_leases" ADD CONSTRAINT "fk_customer_event_leases_session" FOREIGN KEY ("session_id") REFERENCES "public"."customer_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_sessions" ADD CONSTRAINT "fk_customer_sessions_customer" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "fk_customers_user" FOREIGN KEY ("id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_cycles" ADD CONSTRAINT "fk_loyalty_cycles_membership" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_invitations" ADD CONSTRAINT "fk_operator_invitations_restaurant" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_invitations" ADD CONSTRAINT "fk_operator_invitations_issuer" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_invitations" ADD CONSTRAINT "fk_operator_invitations_acceptor" FOREIGN KEY ("accepted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_deliveries" ADD CONSTRAINT "fk_reward_deliveries_reward" FOREIGN KEY ("reward_id") REFERENCES "public"."rewards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_vouchers" ADD CONSTRAINT "fk_reward_vouchers_reward" FOREIGN KEY ("reward_id") REFERENCES "public"."rewards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_event_leases_session_idx" ON "customer_event_leases" USING btree ("session_id","expires_at");--> statement-breakpoint
CREATE INDEX "customer_sessions_customer_idx" ON "customer_sessions" USING btree ("customer_id","expires_at");--> statement-breakpoint
CREATE INDEX "loyalty_cycles_open_idx" ON "loyalty_cycles" USING btree ("membership_id","state") WHERE state <> 'redeemed';--> statement-breakpoint
CREATE INDEX "operator_invitations_restaurant_idx" ON "operator_invitations" USING btree ("restaurant_id","status");--> statement-breakpoint
CREATE INDEX "reward_deliveries_reward_idx" ON "reward_deliveries" USING btree ("reward_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reward_vouchers_active_reward_unique" ON "reward_vouchers" USING btree ("reward_id") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "rewards" ADD CONSTRAINT "fk_rewards_cycle" FOREIGN KEY ("cycle_id") REFERENCES "public"."loyalty_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
REVOKE ALL ON TABLE public."customers" FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON TABLE public."customer_sessions" FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON TABLE public."operator_invitations" FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON TABLE public."loyalty_cycles" FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON TABLE public."reward_vouchers" FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON TABLE public."reward_deliveries" FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON TABLE public."customer_event_leases" FROM PUBLIC;--> statement-breakpoint
DO $$
DECLARE client_role text;
BEGIN
  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=client_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', 'customers', client_role);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', 'customer_sessions', client_role);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', 'operator_invitations', client_role);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', 'loyalty_cycles', client_role);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', 'reward_vouchers', client_role);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', 'reward_deliveries', client_role);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', 'customer_event_leases', client_role);
    END IF;
  END LOOP;
END $$;
