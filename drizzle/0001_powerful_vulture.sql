CREATE TABLE "payment_requisites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"inn" text NOT NULL,
	"bank_account" text NOT NULL,
	"bank_name" text NOT NULL,
	"bik" text NOT NULL,
	"corr_account" text NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
