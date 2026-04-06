CREATE TABLE "ai_course_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'draft',
	"sources" jsonb DEFAULT '[]'::jsonb,
	"params" jsonb,
	"result" jsonb,
	"published_course_id" uuid,
	"tokens_input" integer DEFAULT 0,
	"tokens_output" integer DEFAULT 0,
	"cost_usd" text DEFAULT '0',
	"created_by" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ai_usage_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"project_id" uuid,
	"input_tokens" integer,
	"output_tokens" integer,
	"model" text,
	"cost_usd" text DEFAULT '0',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "ai_course_projects" ADD CONSTRAINT "ai_course_projects_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_course_projects" ADD CONSTRAINT "ai_course_projects_published_course_id_courses_id_fk" FOREIGN KEY ("published_course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_course_projects" ADD CONSTRAINT "ai_course_projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_log" ADD CONSTRAINT "ai_usage_log_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_log" ADD CONSTRAINT "ai_usage_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_log" ADD CONSTRAINT "ai_usage_log_project_id_ai_course_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."ai_course_projects"("id") ON DELETE cascade ON UPDATE no action;