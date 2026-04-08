CREATE TABLE IF NOT EXISTS "demo_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid REFERENCES "companies"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "niche" text NOT NULL DEFAULT 'universal',
  "length" text NOT NULL DEFAULT 'standard',
  "is_system" boolean DEFAULT false,
  "sections" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "variables_used" jsonb DEFAULT '[]'::jsonb,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "vacancy_demos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "vacancy_id" uuid NOT NULL REFERENCES "vacancies"("id") ON DELETE CASCADE,
  "template_id" uuid REFERENCES "demo_templates"("id"),
  "name" text NOT NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "sections" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "settings" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);
