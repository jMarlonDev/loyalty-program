CREATE TABLE "branch_invitations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"max_uses" integer NOT NULL,
	"uses" integer DEFAULT 0 NOT NULL,
	"revoked_at" timestamp with time zone,
	"replaced_by" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "branch_invitations_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "branch_invitations_uses_check" CHECK (max_uses BETWEEN 1 AND 50 AND uses >= 0 AND uses <= max_uses)
);
--> statement-breakpoint
ALTER TABLE "branch_invitations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "employee_locations" (
	"employee_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "employee_locations_pk" PRIMARY KEY("employee_id","location_id")
);
--> statement-breakpoint
ALTER TABLE "employee_locations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "physical_point" varchar(255);--> statement-breakpoint
ALTER TABLE "branch_invitations" ADD CONSTRAINT "fk_branch_invitations_restaurant" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_invitations" ADD CONSTRAINT "fk_branch_invitations_location" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_invitations" ADD CONSTRAINT "fk_branch_invitations_creator" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_locations" ADD CONSTRAINT "fk_employee_locations_employee" FOREIGN KEY ("employee_id") REFERENCES "public"."restaurant_employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_locations" ADD CONSTRAINT "fk_employee_locations_location" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "branch_invitations_location_idx" ON "branch_invitations" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "employee_locations_location_idx" ON "employee_locations" USING btree ("location_id");--> statement-breakpoint
-- BRANCH-001: los empleados existentes conservan acceso a las sucursales activas de su restaurante.
INSERT INTO employee_locations(employee_id,location_id,created_at)
SELECT e.id,l.id,now() FROM restaurant_employees e
JOIN locations l ON l.restaurant_id=e.restaurant_id AND l.status='active'
ON CONFLICT DO NOTHING;--> statement-breakpoint
REVOKE ALL ON TABLE public."employee_locations" FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON TABLE public."branch_invitations" FROM PUBLIC;--> statement-breakpoint
DO $$
DECLARE client_role text;
BEGIN
  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=client_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', 'employee_locations', client_role);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', 'branch_invitations', client_role);
    END IF;
  END LOOP;
END $$;
