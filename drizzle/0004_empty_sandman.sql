CREATE TABLE "badges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon" text NOT NULL,
	"condition" jsonb,
	"points" integer DEFAULT 0,
	CONSTRAINT "badges_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "employee_badges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"points_id" uuid NOT NULL,
	"badge_id" uuid NOT NULL,
	"earned_at" timestamp DEFAULT now(),
	CONSTRAINT "employee_badges_points_id_badge_id_unique" UNIQUE("points_id","badge_id")
);
--> statement-breakpoint
CREATE TABLE "employee_points" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" text NOT NULL,
	"total_points" integer DEFAULT 0,
	"level" integer DEFAULT 1,
	"streak" integer DEFAULT 0,
	"last_active_date" timestamp,
	CONSTRAINT "employee_points_tenant_id_employee_id_unique" UNIQUE("tenant_id","employee_id")
);
--> statement-breakpoint
CREATE TABLE "points_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"points_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"reason" text NOT NULL,
	"source_type" text,
	"source_id" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "badges" ADD CONSTRAINT "badges_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_badges" ADD CONSTRAINT "employee_badges_points_id_employee_points_id_fk" FOREIGN KEY ("points_id") REFERENCES "public"."employee_points"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_badges" ADD CONSTRAINT "employee_badges_badge_id_badges_id_fk" FOREIGN KEY ("badge_id") REFERENCES "public"."badges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_points" ADD CONSTRAINT "employee_points_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points_history" ADD CONSTRAINT "points_history_points_id_employee_points_id_fk" FOREIGN KEY ("points_id") REFERENCES "public"."employee_points"("id") ON DELETE cascade ON UPDATE no action;