-- E1: LMS — courses, lessons, enrollments, completions, certificates
CREATE TABLE "courses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
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
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);
CREATE TABLE "lessons" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "course_id" uuid NOT NULL REFERENCES "courses"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "sort_order" integer DEFAULT 0,
  "type" text DEFAULT 'content',
  "content" jsonb,
  "duration_min" integer,
  "is_required" boolean DEFAULT true
);
CREATE TABLE "course_enrollments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "course_id" uuid NOT NULL REFERENCES "courses"("id") ON DELETE CASCADE,
  "employee_id" text NOT NULL,
  "status" text DEFAULT 'enrolled',
  "completion_pct" integer DEFAULT 0,
  "enrolled_at" timestamp DEFAULT now(),
  "started_at" timestamp,
  "completed_at" timestamp,
  "last_access_at" timestamp,
  UNIQUE("course_id", "employee_id")
);
CREATE TABLE "lesson_completions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "enrollment_id" uuid NOT NULL REFERENCES "course_enrollments"("id") ON DELETE CASCADE,
  "lesson_id" uuid NOT NULL REFERENCES "lessons"("id") ON DELETE CASCADE,
  "status" text DEFAULT 'not_started',
  "score" integer,
  "answer" jsonb,
  "completed_at" timestamp,
  "time_spent_sec" integer,
  UNIQUE("enrollment_id", "lesson_id")
);
CREATE TABLE "certificates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "course_id" uuid NOT NULL REFERENCES "courses"("id") ON DELETE CASCADE,
  "employee_id" text NOT NULL,
  "number" text UNIQUE NOT NULL,
  "issued_at" timestamp DEFAULT now(),
  "valid_until" timestamp,
  "pdf_url" text
);
