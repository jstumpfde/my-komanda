-- F1: Skills, position requirements, assessments
CREATE TABLE "skills" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid REFERENCES "companies"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "category" text NOT NULL DEFAULT 'soft',
  "description" text
);
CREATE TABLE "position_skills" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "position_id" text NOT NULL,
  "skill_id" uuid NOT NULL REFERENCES "skills"("id") ON DELETE CASCADE,
  "required_level" integer NOT NULL DEFAULT 3,
  UNIQUE("position_id", "skill_id")
);
CREATE TABLE "assessments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "employee_id" text NOT NULL,
  "type" text NOT NULL DEFAULT 'self',
  "status" text NOT NULL DEFAULT 'draft',
  "period" text,
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now(),
  "completed_at" timestamp
);
CREATE TABLE "skill_assessments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "assessment_id" uuid NOT NULL REFERENCES "assessments"("id") ON DELETE CASCADE,
  "skill_id" uuid NOT NULL REFERENCES "skills"("id") ON DELETE CASCADE,
  "score" integer,
  "comment" text,
  "assessor_id" text
);
CREATE TABLE "assessment_reviewers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "assessment_id" uuid NOT NULL REFERENCES "assessments"("id") ON DELETE CASCADE,
  "reviewer_id" text NOT NULL,
  "role" text NOT NULL DEFAULT 'peer',
  "status" text NOT NULL DEFAULT 'pending',
  "completed_at" timestamp
);
