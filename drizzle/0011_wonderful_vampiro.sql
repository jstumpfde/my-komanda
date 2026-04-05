CREATE TABLE "sales_companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
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
--> statement-breakpoint
CREATE TABLE "sales_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"company_id" uuid,
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
--> statement-breakpoint
ALTER TABLE "vacancies" ADD COLUMN "client_company_id" uuid;--> statement-breakpoint
ALTER TABLE "vacancies" ADD COLUMN "client_contact_id" uuid;--> statement-breakpoint
ALTER TABLE "vacancy_utm_links" ADD COLUMN "destination_url" text;--> statement-breakpoint
ALTER TABLE "sales_companies" ADD CONSTRAINT "sales_companies_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_contacts" ADD CONSTRAINT "sales_contacts_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_contacts" ADD CONSTRAINT "sales_contacts_company_id_sales_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."sales_companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vacancies" ADD CONSTRAINT "vacancies_client_company_id_sales_companies_id_fk" FOREIGN KEY ("client_company_id") REFERENCES "public"."sales_companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vacancies" ADD CONSTRAINT "vacancies_client_contact_id_sales_contacts_id_fk" FOREIGN KEY ("client_contact_id") REFERENCES "public"."sales_contacts"("id") ON DELETE set null ON UPDATE no action;