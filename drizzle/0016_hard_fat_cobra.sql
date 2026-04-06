CREATE TABLE "access_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"company_name" text,
	"comment" text,
	"status" text DEFAULT 'new',
	"created_at" timestamp DEFAULT now()
);
