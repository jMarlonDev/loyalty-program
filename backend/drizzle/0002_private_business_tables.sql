ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "closure_consents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "idempotency_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invitations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "locations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "loyalty_cards" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "loyalty_ledger_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "loyalty_programs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "purchases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "restaurant_employees" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "restaurants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reward_purchase_allocations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rewards" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE public."audit_events", public."closure_consents", public."idempotency_records", public."invitations", public."locations", public."loyalty_cards", public."loyalty_ledger_entries", public."loyalty_programs", public."memberships", public."purchases", public."restaurant_employees", public."restaurants", public."reward_purchase_allocations", public."rewards", public."roles", public."users" FROM PUBLIC;
--> statement-breakpoint
DO $$
DECLARE client_role text;
BEGIN
  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = client_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE public."audit_events", public."closure_consents", public."idempotency_records", public."invitations", public."locations", public."loyalty_cards", public."loyalty_ledger_entries", public."loyalty_programs", public."memberships", public."purchases", public."restaurant_employees", public."restaurants", public."reward_purchase_allocations", public."rewards", public."roles", public."users" FROM %I', client_role);
    END IF;
  END LOOP;
END $$;
