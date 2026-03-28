CREATE TABLE "adaptation_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"employee_id" uuid,
	"buddy_id" uuid,
	"start_date" timestamp,
	"status" text DEFAULT 'active',
	"current_day" integer DEFAULT 1,
	"completion_pct" integer DEFAULT 0,
	"total_steps" integer,
	"completed_steps" integer DEFAULT 0,
	"avg_response_time" integer,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "adaptation_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"position_id" text,
	"duration_days" integer DEFAULT 14,
	"plan_type" text DEFAULT 'onboarding',
	"is_template" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "adaptation_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"day_number" integer NOT NULL,
	"sort_order" integer DEFAULT 0,
	"title" text NOT NULL,
	"type" text DEFAULT 'lesson',
	"content" jsonb,
	"channel" text DEFAULT 'auto',
	"duration_min" integer,
	"is_required" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "step_completions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"step_id" uuid NOT NULL,
	"status" text DEFAULT 'pending',
	"sent_at" timestamp,
	"viewed_at" timestamp,
	"completed_at" timestamp,
	"answer" jsonb,
	"score" integer,
	"feedback" text,
	CONSTRAINT "step_completions_assignment_id_step_id_unique" UNIQUE("assignment_id","step_id")
);
--> statement-breakpoint
ALTER TABLE "adaptation_assignments" ADD CONSTRAINT "adaptation_assignments_plan_id_adaptation_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."adaptation_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adaptation_plans" ADD CONSTRAINT "adaptation_plans_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adaptation_plans" ADD CONSTRAINT "adaptation_plans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adaptation_steps" ADD CONSTRAINT "adaptation_steps_plan_id_adaptation_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."adaptation_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step_completions" ADD CONSTRAINT "step_completions_assignment_id_adaptation_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."adaptation_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step_completions" ADD CONSTRAINT "step_completions_step_id_adaptation_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."adaptation_steps"("id") ON DELETE cascade ON UPDATE no action;