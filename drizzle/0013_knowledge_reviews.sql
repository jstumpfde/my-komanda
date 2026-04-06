CREATE TABLE "knowledge_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"article_id" uuid NOT NULL,
	"author_id" uuid,
	"action" text NOT NULL,
	"comment" text,
	"voice_url" text,
	"video_url" text,
	"attachments" text[],
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "knowledge_articles" ADD COLUMN "reviewer_id" uuid;--> statement-breakpoint
ALTER TABLE "knowledge_reviews" ADD CONSTRAINT "knowledge_reviews_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_reviews" ADD CONSTRAINT "knowledge_reviews_article_id_knowledge_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."knowledge_articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_reviews" ADD CONSTRAINT "knowledge_reviews_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;