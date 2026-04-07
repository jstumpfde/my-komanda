CREATE TABLE IF NOT EXISTS "custom_vacancy_categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "name" text NOT NULL,
  "created_at" timestamp DEFAULT now(),
  CONSTRAINT "custom_vacancy_categories_company_id_name_unique" UNIQUE("company_id","name")
);

DO $$ BEGIN
  ALTER TABLE "custom_vacancy_categories"
    ADD CONSTRAINT "custom_vacancy_categories_company_id_companies_id_fk"
    FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
