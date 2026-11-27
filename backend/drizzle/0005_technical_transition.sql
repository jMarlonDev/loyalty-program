-- DB-006 / NEXT-005. Reconciliar antes de clasificar: nunca reconstruir débitos.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM rewards r
    WHERE COALESCE((SELECT sum(l.stamp_delta) FROM loyalty_ledger_entries l
                   WHERE l.reward_id=r.id AND l.stamp_delta<0),0) <> -r.stamps_spent
       OR (SELECT count(*) FROM reward_purchase_allocations a WHERE a.reward_id=r.id) <> r.stamps_spent
       OR (r.status IN ('available','redeemed') AND (
          COALESCE((SELECT sum(l.stamp_delta) FROM loyalty_ledger_entries l WHERE l.reward_id=r.id),0) <> -r.stamps_spent
          OR (SELECT count(*) FROM reward_purchase_allocations a WHERE a.reward_id=r.id AND a.released_at IS NULL) <> r.stamps_spent))
       OR (r.status='cancelled' AND EXISTS (
          SELECT 1 FROM reward_purchase_allocations a WHERE a.reward_id=r.id AND a.released_at IS NULL))
  ) THEN
    RAISE EXCEPTION 'Contabilidad de premios incompatible con DB-006: revisar el informe 0004 antes de migrar. No se modificaron beneficios.';
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE "card_events_outbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"card_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"type" varchar(30) NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"available_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_token" uuid,
	"lease_until" timestamp with time zone,
	"published_at" timestamp with time zone,
	CONSTRAINT "card_events_outbox_card_version_unique" UNIQUE("card_id","version"),
	CONSTRAINT "card_events_outbox_version_check" CHECK (version > 0),
	CONSTRAINT "card_events_outbox_attempts_check" CHECK (attempts >= 0),
	CONSTRAINT "card_events_outbox_type_check" CHECK (type IN ('purchase.recorded', 'reward.available', 'reward.redeemed', 'card.changed')),
	CONSTRAINT "card_events_outbox_lease_token_check" CHECK ((lease_token IS NULL) = (lease_until IS NULL))
);
--> statement-breakpoint
ALTER TABLE "card_events_outbox" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "loyalty_cards" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "owner_user_id" uuid;--> statement-breakpoint
ALTER TABLE "rewards" ADD COLUMN "accounting_mode" varchar(30) DEFAULT 'legacy_debited' NOT NULL;--> statement-breakpoint
ALTER TABLE "card_events_outbox" ADD CONSTRAINT "fk_card_events_outbox_card" FOREIGN KEY ("card_id") REFERENCES "public"."loyalty_cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "card_events_outbox_pending_idx" ON "card_events_outbox" USING btree ("available_at","lease_until") WHERE published_at IS NULL;--> statement-breakpoint
ALTER TABLE "restaurants" ADD CONSTRAINT "fk_restaurants_owner_user" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_cards" ADD CONSTRAINT "loyalty_cards_version_check" CHECK (version >= 0);--> statement-breakpoint
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_accounting_mode_check" CHECK (accounting_mode IN ('legacy_debited', 'debit_on_redemption'));
--> statement-breakpoint
REVOKE ALL ON TABLE public."card_events_outbox" FROM PUBLIC;
--> statement-breakpoint
DO $$
DECLARE client_role text;
BEGIN
  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=client_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE public."card_events_outbox" FROM %I', client_role);
    END IF;
  END LOOP;
END $$;
