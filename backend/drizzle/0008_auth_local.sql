CREATE TABLE "staff_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"access_hash" text NOT NULL,
	"access_expires_at" timestamp with time zone NOT NULL,
	"refresh_hash" text NOT NULL,
	"refresh_expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"user_agent" varchar(255),
	"created_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	CONSTRAINT "staff_sessions_access_hash_unique" UNIQUE("access_hash"),
	CONSTRAINT "staff_sessions_refresh_hash_unique" UNIQUE("refresh_hash")
);
--> statement-breakpoint
ALTER TABLE "staff_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "enrollment_attempts" DROP CONSTRAINT "enrollment_attempts_scope_check";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_sessions" ADD CONSTRAINT "fk_staff_sessions_user" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "staff_sessions_user_idx" ON "staff_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_unique" ON "users" USING btree (lower("email")) WHERE "users"."email" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "enrollment_attempts" ADD CONSTRAINT "enrollment_attempts_scope_check" CHECK (scope IN ('ip', 'device', 'login'));--> statement-breakpoint
REVOKE ALL ON TABLE public."staff_sessions" FROM PUBLIC;--> statement-breakpoint
DO $$
DECLARE client_role text;
BEGIN
  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=client_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', 'staff_sessions', client_role);
    END IF;
  END LOOP;
END $$;
