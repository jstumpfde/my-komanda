CREATE TABLE "ai_chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"session_id" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "assessment_reviewers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"reviewer_id" text NOT NULL,
	"role" text DEFAULT 'peer' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" text NOT NULL,
	"type" text DEFAULT 'self' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"period" text,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now(),
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "buddy_checklists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"items" jsonb DEFAULT '[]' NOT NULL,
	"is_default" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "buddy_meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"title" text NOT NULL,
	"scheduled_at" timestamp,
	"completed_at" timestamp,
	"status" text DEFAULT 'scheduled',
	"notes" text,
	"rating" integer,
	"feedback" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "buddy_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"checklist_item_id" text,
	"title" text NOT NULL,
	"description" text,
	"day_number" integer,
	"status" text DEFAULT 'pending',
	"completed_at" timestamp,
	"note" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "calendar_event_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'pending',
	CONSTRAINT "calendar_event_participants_event_id_user_id_unique" UNIQUE("event_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"type" text DEFAULT 'meeting' NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"all_day" boolean DEFAULT false,
	"room_id" uuid,
	"created_by" uuid NOT NULL,
	"color" text,
	"recurrence" text,
	"status" text DEFAULT 'confirmed',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "certificates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"employee_id" text NOT NULL,
	"number" text NOT NULL,
	"issued_at" timestamp DEFAULT now(),
	"valid_until" timestamp,
	"pdf_url" text,
	CONSTRAINT "certificates_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "course_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"employee_id" text NOT NULL,
	"status" text DEFAULT 'enrolled',
	"completion_pct" integer DEFAULT 0,
	"enrolled_at" timestamp DEFAULT now(),
	"started_at" timestamp,
	"completed_at" timestamp,
	"last_access_at" timestamp,
	CONSTRAINT "course_enrollments_course_id_employee_id_unique" UNIQUE("course_id","employee_id")
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"cover_image" text,
	"category" text DEFAULT 'custom',
	"difficulty" text DEFAULT 'beginner',
	"duration_min" integer,
	"is_published" boolean DEFAULT false,
	"is_required" boolean DEFAULT false,
	"required_for" jsonb,
	"sort_order" integer DEFAULT 0,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "exit_surveys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"channel" text DEFAULT 'web',
	"status" text DEFAULT 'pending',
	"sent_at" timestamp,
	"completed_at" timestamp,
	"responses" jsonb,
	"overall_score" integer,
	"would_return" boolean,
	"would_recommend" boolean,
	"open_feedback" text,
	"is_anonymous" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "flight_risk_factors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"weight" integer DEFAULT 1,
	"description" text,
	"is_active" boolean DEFAULT true,
	CONSTRAINT "flight_risk_factors_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "flight_risk_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" text NOT NULL,
	"employee_name" text,
	"department" text,
	"position" text,
	"score" integer DEFAULT 0 NOT NULL,
	"risk_level" text DEFAULT 'low',
	"factors" jsonb,
	"previous_score" integer,
	"trend" text DEFAULT 'stable',
	"calculated_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "flight_risk_scores_tenant_id_employee_id_unique" UNIQUE("tenant_id","employee_id")
);
--> statement-breakpoint
CREATE TABLE "hh_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"hh_resume_id" text NOT NULL,
	"hh_application_id" text,
	"imported_at" timestamp DEFAULT now(),
	CONSTRAINT "hh_candidates_hh_resume_id_unique" UNIQUE("hh_resume_id")
);
--> statement-breakpoint
CREATE TABLE "hh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"hh_employer_id" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "hh_tokens_company_id_unique" UNIQUE("company_id")
);
--> statement-breakpoint
CREATE TABLE "hh_vacancies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vacancy_id" uuid NOT NULL,
	"hh_vacancy_id" text NOT NULL,
	"hh_status" text DEFAULT 'active',
	"published_at" timestamp with time zone DEFAULT now(),
	"expires_at" timestamp with time zone,
	"views" integer DEFAULT 0,
	"responses" integer DEFAULT 0,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "integrator_clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"integrator_id" uuid NOT NULL,
	"client_company_id" uuid NOT NULL,
	"referred_at" timestamp DEFAULT now(),
	CONSTRAINT "integrator_clients_integrator_id_client_company_id_unique" UNIQUE("integrator_id","client_company_id")
);
--> statement-breakpoint
CREATE TABLE "integrator_levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"min_clients" integer DEFAULT 0,
	"min_mrr_kopecks" integer DEFAULT 0,
	"commission_percent" text NOT NULL,
	"sort_order" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "integrator_payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"integrator_id" uuid NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"total_mrr_kopecks" integer DEFAULT 0,
	"commission_percent" text,
	"payout_kopecks" integer DEFAULT 0,
	"status" text DEFAULT 'pending',
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "integrators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"level_id" uuid,
	"contact_name" text,
	"contact_email" text,
	"contact_phone" text,
	"status" text DEFAULT 'active',
	"joined_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "integrators_company_id_unique" UNIQUE("company_id")
);
--> statement-breakpoint
CREATE TABLE "internal_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"department" text,
	"required_skills" jsonb,
	"status" text DEFAULT 'open',
	"max_participants" integer DEFAULT 5,
	"start_date" timestamp,
	"end_date" timestamp,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "invite_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"created_by" uuid,
	"token" text NOT NULL,
	"role" text NOT NULL,
	"label" text,
	"max_uses" integer DEFAULT 1,
	"uses_count" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "invite_links_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"number" text NOT NULL,
	"plan_id" uuid,
	"amount_kopecks" bigint NOT NULL,
	"status" text DEFAULT 'draft',
	"issued_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"due_date" timestamp with time zone,
	"payment_method" text,
	"pdf_url" text,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "invoices_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "lesson_completions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"status" text DEFAULT 'not_started',
	"score" integer,
	"answer" jsonb,
	"completed_at" timestamp,
	"time_spent_sec" integer,
	CONSTRAINT "lesson_completions_enrollment_id_lesson_id_unique" UNIQUE("enrollment_id","lesson_id")
);
--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"title" text NOT NULL,
	"sort_order" integer DEFAULT 0,
	"type" text DEFAULT 'content',
	"content" jsonb,
	"duration_min" integer,
	"is_required" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"module" text NOT NULL,
	"category" text NOT NULL,
	"channel_email" boolean DEFAULT true,
	"channel_telegram" boolean DEFAULT false,
	"channel_push" boolean DEFAULT false,
	"channel_web" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "notification_preferences_user_id_module_category_unique" UNIQUE("user_id","module","category")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"severity" text DEFAULT 'info',
	"source_type" text,
	"source_id" text,
	"href" text,
	"is_read" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "offboarding_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" text NOT NULL,
	"employee_name" text,
	"department" text,
	"position" text,
	"reason" text DEFAULT 'voluntary',
	"last_work_day" timestamp,
	"status" text DEFAULT 'initiated',
	"checklist_json" jsonb,
	"referral_bridge" boolean DEFAULT false,
	"rehire_eligible" boolean DEFAULT true,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "position_skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"position_id" text NOT NULL,
	"skill_id" uuid NOT NULL,
	"required_level" integer DEFAULT 3 NOT NULL,
	CONSTRAINT "position_skills_position_id_skill_id_unique" UNIQUE("position_id","skill_id")
);
--> statement-breakpoint
CREATE TABLE "predictive_hiring_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"flight_risk_id" uuid,
	"employee_id" text NOT NULL,
	"employee_name" text,
	"position" text,
	"department" text,
	"risk_score" integer,
	"status" text DEFAULT 'new',
	"vacancy_id" uuid,
	"talent_pool_match" jsonb,
	"created_at" timestamp DEFAULT now(),
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "project_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"employee_id" text NOT NULL,
	"employee_name" text,
	"department" text,
	"motivation" text,
	"match_score" integer,
	"status" text DEFAULT 'pending',
	"applied_at" timestamp DEFAULT now(),
	"resolved_at" timestamp,
	CONSTRAINT "project_applications_project_id_employee_id_unique" UNIQUE("project_id","employee_id")
);
--> statement-breakpoint
CREATE TABLE "pulse_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"text" text NOT NULL,
	"category" text DEFAULT 'engagement',
	"is_system" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"sort_order" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "pulse_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"survey_id" uuid NOT NULL,
	"employee_id" text NOT NULL,
	"question_id" uuid NOT NULL,
	"score" integer,
	"open_text" text,
	"is_anonymous" boolean DEFAULT true,
	"responded_at" timestamp DEFAULT now(),
	CONSTRAINT "pulse_responses_survey_id_employee_id_question_id_unique" UNIQUE("survey_id","employee_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "pulse_surveys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" text,
	"scheduled_at" timestamp,
	"sent_at" timestamp,
	"closes_at" timestamp,
	"status" text DEFAULT 'draft',
	"channel" text DEFAULT 'telegram',
	"question_ids" jsonb,
	"response_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "reskilling_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"position" text NOT NULL,
	"department" text,
	"automation_risk" integer DEFAULT 0,
	"risk_level" text DEFAULT 'low',
	"ai_impact_summary" text,
	"tasks_at_risk" jsonb,
	"recommended_skills" jsonb,
	"calculated_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "reskilling_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" text NOT NULL,
	"employee_name" text,
	"current_position" text,
	"target_position" text,
	"status" text DEFAULT 'draft',
	"progress" integer DEFAULT 0,
	"skills" jsonb,
	"due_date" timestamp,
	"completed_at" timestamp,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "retention_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"type" text DEFAULT 'conversation',
	"status" text DEFAULT 'planned',
	"priority" text DEFAULT 'medium',
	"assigned_to" uuid,
	"due_date" timestamp,
	"completed_at" timestamp,
	"outcome" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"capacity" integer,
	"equipment" text[],
	"floor" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "skill_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"score" integer,
	"comment" text,
	"assessor_id" text
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"name" text NOT NULL,
	"category" text DEFAULT 'soft' NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "sms_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"code" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used" boolean DEFAULT false,
	"attempts" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "subscription_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"plan_id" uuid,
	"status" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"reason" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "adaptation_steps" ADD COLUMN "conditions" jsonb;--> statement-breakpoint
ALTER TABLE "adaptation_steps" ADD COLUMN "created_by_role" text DEFAULT 'hr';--> statement-breakpoint
ALTER TABLE "adaptation_steps" ADD COLUMN "is_approved" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "adaptation_steps" ADD COLUMN "approved_by" uuid;--> statement-breakpoint
ALTER TABLE "adaptation_steps" ADD COLUMN "approved_at" timestamp;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "anketa_answers" jsonb;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "ai_score" integer;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "ai_summary" text;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "ai_details" jsonb;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "postal_code" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "founded_year" integer;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "revenue_range" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "crm_status" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "crm_name" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "sales_scripts" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "training_system" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "trainer" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "sales_manager_type" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "is_multi_product" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "custom_theme" jsonb;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "current_plan_id" uuid;--> statement-breakpoint
ALTER TABLE "plan_modules" ADD COLUMN "allow_custom_branding" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "plan_modules" ADD COLUMN "allow_custom_colors" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "plan_modules" ADD COLUMN "limits" jsonb;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "trial_days" integer DEFAULT 14;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "is_archived" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "tenant_modules" ADD COLUMN "custom_limits" jsonb;--> statement-breakpoint
ALTER TABLE "tenant_modules" ADD COLUMN "enabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenant_modules" ADD COLUMN "disabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vacancies" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "vacancies" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "ai_chat_messages" ADD CONSTRAINT "ai_chat_messages_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_chat_messages" ADD CONSTRAINT "ai_chat_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_reviewers" ADD CONSTRAINT "assessment_reviewers_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buddy_checklists" ADD CONSTRAINT "buddy_checklists_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buddy_meetings" ADD CONSTRAINT "buddy_meetings_assignment_id_adaptation_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."adaptation_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buddy_tasks" ADD CONSTRAINT "buddy_tasks_assignment_id_adaptation_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."adaptation_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event_participants" ADD CONSTRAINT "calendar_event_participants_event_id_calendar_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."calendar_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event_participants" ADD CONSTRAINT "calendar_event_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exit_surveys" ADD CONSTRAINT "exit_surveys_case_id_offboarding_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."offboarding_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight_risk_scores" ADD CONSTRAINT "flight_risk_scores_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hh_candidates" ADD CONSTRAINT "hh_candidates_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hh_tokens" ADD CONSTRAINT "hh_tokens_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hh_vacancies" ADD CONSTRAINT "hh_vacancies_vacancy_id_vacancies_id_fk" FOREIGN KEY ("vacancy_id") REFERENCES "public"."vacancies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrator_clients" ADD CONSTRAINT "integrator_clients_integrator_id_integrators_id_fk" FOREIGN KEY ("integrator_id") REFERENCES "public"."integrators"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrator_clients" ADD CONSTRAINT "integrator_clients_client_company_id_companies_id_fk" FOREIGN KEY ("client_company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrator_payouts" ADD CONSTRAINT "integrator_payouts_integrator_id_integrators_id_fk" FOREIGN KEY ("integrator_id") REFERENCES "public"."integrators"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrators" ADD CONSTRAINT "integrators_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrators" ADD CONSTRAINT "integrators_level_id_integrator_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."integrator_levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_projects" ADD CONSTRAINT "internal_projects_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_projects" ADD CONSTRAINT "internal_projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_links" ADD CONSTRAINT "invite_links_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_links" ADD CONSTRAINT "invite_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_completions" ADD CONSTRAINT "lesson_completions_enrollment_id_course_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."course_enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_completions" ADD CONSTRAINT "lesson_completions_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offboarding_cases" ADD CONSTRAINT "offboarding_cases_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offboarding_cases" ADD CONSTRAINT "offboarding_cases_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_skills" ADD CONSTRAINT "position_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predictive_hiring_alerts" ADD CONSTRAINT "predictive_hiring_alerts_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predictive_hiring_alerts" ADD CONSTRAINT "predictive_hiring_alerts_flight_risk_id_flight_risk_scores_id_fk" FOREIGN KEY ("flight_risk_id") REFERENCES "public"."flight_risk_scores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predictive_hiring_alerts" ADD CONSTRAINT "predictive_hiring_alerts_vacancy_id_vacancies_id_fk" FOREIGN KEY ("vacancy_id") REFERENCES "public"."vacancies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_applications" ADD CONSTRAINT "project_applications_project_id_internal_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."internal_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pulse_questions" ADD CONSTRAINT "pulse_questions_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pulse_responses" ADD CONSTRAINT "pulse_responses_survey_id_pulse_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."pulse_surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pulse_responses" ADD CONSTRAINT "pulse_responses_question_id_pulse_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."pulse_questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pulse_surveys" ADD CONSTRAINT "pulse_surveys_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reskilling_assessments" ADD CONSTRAINT "reskilling_assessments_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reskilling_plans" ADD CONSTRAINT "reskilling_plans_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reskilling_plans" ADD CONSTRAINT "reskilling_plans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_actions" ADD CONSTRAINT "retention_actions_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_actions" ADD CONSTRAINT "retention_actions_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_assessments" ADD CONSTRAINT "skill_assessments_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_assessments" ADD CONSTRAINT "skill_assessments_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_history" ADD CONSTRAINT "subscription_history_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_history" ADD CONSTRAINT "subscription_history_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adaptation_steps" ADD CONSTRAINT "adaptation_steps_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_current_plan_id_plans_id_fk" FOREIGN KEY ("current_plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;