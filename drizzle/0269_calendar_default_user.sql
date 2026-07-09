ALTER TABLE "companies" ADD COLUMN "calendar_default_user_id" uuid;
ALTER TABLE "companies" ADD CONSTRAINT "companies_calendar_default_user_id_users_id_fk"
  FOREIGN KEY ("calendar_default_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;
