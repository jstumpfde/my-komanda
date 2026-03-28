-- D1: adaptive tracks + D4: UGC columns on adaptation_steps
ALTER TABLE "adaptation_steps"
  ADD COLUMN "conditions" jsonb,
  ADD COLUMN "created_by_role" text DEFAULT 'hr',
  ADD COLUMN "is_approved" boolean DEFAULT true,
  ADD COLUMN "approved_by" uuid REFERENCES "users"("id"),
  ADD COLUMN "approved_at" timestamp;

-- D2: Buddy tables
CREATE TABLE "buddy_checklists" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "items" jsonb DEFAULT '[]' NOT NULL,
  "is_default" boolean DEFAULT false,
  "created_at" timestamp DEFAULT now()
);

CREATE TABLE "buddy_tasks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "assignment_id" uuid NOT NULL REFERENCES "adaptation_assignments"("id") ON DELETE CASCADE,
  "checklist_item_id" text,
  "title" text NOT NULL,
  "description" text,
  "day_number" integer,
  "status" text DEFAULT 'pending',
  "completed_at" timestamp,
  "note" text,
  "created_at" timestamp DEFAULT now()
);

CREATE TABLE "buddy_meetings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "assignment_id" uuid NOT NULL REFERENCES "adaptation_assignments"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "scheduled_at" timestamp,
  "completed_at" timestamp,
  "status" text DEFAULT 'scheduled',
  "notes" text,
  "rating" integer,
  "feedback" text,
  "created_at" timestamp DEFAULT now()
);
