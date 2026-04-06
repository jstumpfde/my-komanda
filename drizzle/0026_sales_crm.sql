-- Sales CRM tables + vacancy foreign keys
CREATE TABLE IF NOT EXISTS "sales_companies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "inn" text,
  "kpp" text,
  "ogrn" text,
  "industry" text,
  "city" text,
  "address" text,
  "website" text,
  "phone" text,
  "email" text,
  "revenue" text,
  "employees_count" integer,
  "description" text,
  "logo_url" text,
  "type" text DEFAULT 'client',
  "status" text DEFAULT 'active',
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "sales_contacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "company_id" uuid REFERENCES "sales_companies"("id") ON DELETE SET NULL,
  "first_name" text NOT NULL,
  "last_name" text NOT NULL,
  "middle_name" text,
  "position" text,
  "department" text,
  "phone" text,
  "mobile" text,
  "email" text,
  "telegram" text,
  "whatsapp" text,
  "comment" text,
  "is_primary" boolean DEFAULT false,
  "status" text DEFAULT 'active',
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

ALTER TABLE "vacancies" ADD COLUMN IF NOT EXISTS "client_company_id" uuid REFERENCES "sales_companies"("id") ON DELETE SET NULL;
ALTER TABLE "vacancies" ADD COLUMN IF NOT EXISTS "client_contact_id" uuid REFERENCES "sales_contacts"("id") ON DELETE SET NULL;
