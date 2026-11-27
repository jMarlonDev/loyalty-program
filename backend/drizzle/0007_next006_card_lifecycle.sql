CREATE TABLE "card_transfers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"card_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_by" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "card_transfers_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "card_transfers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "enrollment_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"scope" varchar(10) NOT NULL,
	"key_hash" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "enrollment_attempts_scope_check" CHECK (scope IN ('ip', 'device'))
);
--> statement-breakpoint
ALTER TABLE "enrollment_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "loyalty_cards" DROP CONSTRAINT "loyalty_cards_status_check";--> statement-breakpoint
ALTER TABLE "customer_sessions" ADD COLUMN "card_id" uuid;--> statement-breakpoint
ALTER TABLE "customer_sessions" ADD COLUMN "user_agent" varchar(255);--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "is_reenrollment" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "previous_cards_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "close_reason" varchar(40);--> statement-breakpoint
ALTER TABLE "restaurant_employees" ADD COLUMN "can_transfer_cards" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "card_transfers" ADD CONSTRAINT "fk_card_transfers_card" FOREIGN KEY ("card_id") REFERENCES "public"."loyalty_cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_transfers" ADD CONSTRAINT "fk_card_transfers_creator" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "card_transfers_card_idx" ON "card_transfers" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "enrollment_attempts_lookup_idx" ON "enrollment_attempts" USING btree ("scope","key_hash","created_at");--> statement-breakpoint
ALTER TABLE "customer_sessions" ADD CONSTRAINT "fk_customer_sessions_card" FOREIGN KEY ("card_id") REFERENCES "public"."loyalty_cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_sessions_card_idx" ON "customer_sessions" USING btree ("card_id");--> statement-breakpoint
ALTER TABLE "loyalty_cards" ADD CONSTRAINT "loyalty_cards_status_check" CHECK (status IN ('active', 'blocked', 'closed'));--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_previous_cards_check" CHECK (previous_cards_count >= 0);--> statement-breakpoint
REVOKE ALL ON TABLE public."card_transfers" FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON TABLE public."enrollment_attempts" FROM PUBLIC;--> statement-breakpoint
DO $$
DECLARE client_role text;
BEGIN
  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=client_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', 'card_transfers', client_role);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', 'enrollment_attempts', client_role);
    END IF;
  END LOOP;
END $$;
