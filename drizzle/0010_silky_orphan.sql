CREATE TABLE "vacancy_utm_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vacancy_id" uuid NOT NULL,
	"source" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"clicks" integer DEFAULT 0,
	"candidates_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "vacancy_utm_links_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "vacancy_utm_links" ADD CONSTRAINT "vacancy_utm_links_vacancy_id_vacancies_id_fk" FOREIGN KEY ("vacancy_id") REFERENCES "public"."vacancies"("id") ON DELETE cascade ON UPDATE no action;