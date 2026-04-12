CREATE TABLE IF NOT EXISTS "booking_services" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text,
  "duration" integer NOT NULL DEFAULT 60,
  "price" integer,
  "currency" text DEFAULT 'RUB',
  "color" text DEFAULT '#3B82F6',
  "is_active" boolean DEFAULT true,
  "sort_order" integer DEFAULT 0,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "booking_resources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "type" text DEFAULT 'specialist',
  "description" text,
  "avatar" text,
  "is_active" boolean DEFAULT true,
  "schedule" jsonb,
  "breaks" jsonb,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "bookings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "service_id" uuid NOT NULL REFERENCES "booking_services"("id") ON DELETE CASCADE,
  "resource_id" uuid REFERENCES "booking_resources"("id") ON DELETE SET NULL,
  "contact_id" uuid REFERENCES "sales_contacts"("id") ON DELETE SET NULL,
  "client_name" text NOT NULL,
  "client_phone" text,
  "client_email" text,
  "date" date NOT NULL,
  "start_time" text NOT NULL,
  "end_time" text NOT NULL,
  "status" text NOT NULL DEFAULT 'confirmed',
  "notes" text,
  "price" integer,
  "is_paid" boolean DEFAULT false,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "bookings_tenant_date_idx" ON "bookings" ("tenant_id", "date");
CREATE INDEX IF NOT EXISTS "bookings_resource_date_idx" ON "bookings" ("resource_id", "date");
CREATE INDEX IF NOT EXISTS "booking_services_tenant_idx" ON "booking_services" ("tenant_id");
CREATE INDEX IF NOT EXISTS "booking_resources_tenant_idx" ON "booking_resources" ("tenant_id");
