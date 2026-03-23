CREATE TABLE "candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vacancy_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"city" text,
	"source" text,
	"stage" text DEFAULT 'new',
	"score" integer,
	"salary_min" integer,
	"salary_max" integer,
	"experience" text,
	"skills" text[] DEFAULT '{}',
	"token" text NOT NULL,
	"demo_progress_json" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "candidates_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"inn" text,
	"kpp" text,
	"legal_address" text,
	"city" text,
	"industry" text,
	"logo_url" text,
	"brand_primary_color" text DEFAULT '#3b82f6',
	"brand_bg_color" text DEFAULT '#f0f4ff',
	"brand_text_color" text DEFAULT '#1e293b',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "companies_inn_unique" UNIQUE("inn")
);
--> statement-breakpoint
CREATE TABLE "demos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vacancy_id" uuid NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'draft',
	"lessons_json" jsonb DEFAULT '[]' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text NOT NULL,
	"company_id" uuid,
	"avatar_url" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "vacancies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"title" text NOT NULL,
	"city" text,
	"format" text,
	"employment" text,
	"category" text,
	"sidebar_section" text,
	"salary_min" integer,
	"salary_max" integer,
	"status" text DEFAULT 'draft',
	"slug" text NOT NULL,
	"description_json" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "vacancies_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_vacancy_id_vacancies_id_fk" FOREIGN KEY ("vacancy_id") REFERENCES "public"."vacancies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demos" ADD CONSTRAINT "demos_vacancy_id_vacancies_id_fk" FOREIGN KEY ("vacancy_id") REFERENCES "public"."vacancies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vacancies" ADD CONSTRAINT "vacancies_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vacancies" ADD CONSTRAINT "vacancies_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;