CREATE TABLE IF NOT EXISTS "custom_skills" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "name" text NOT NULL,
  "type" text NOT NULL DEFAULT 'skill',
  "created_at" timestamp DEFAULT now(),
  CONSTRAINT "custom_skills_company_id_name_type_unique" UNIQUE("company_id","name","type")
);

DO $$ BEGIN
  ALTER TABLE "custom_skills"
    ADD CONSTRAINT "custom_skills_company_id_companies_id_fk"
    FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
