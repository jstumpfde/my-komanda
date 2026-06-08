-- HR: структурированная причина отказа кандидату (захват на карточке + отчёт найма).
-- Таксономия категорий — lib/hr/rejection-reasons.ts. initiator: 'company'|'candidate'.
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "rejection_reason_category" text;
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "rejection_initiator" text;
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "rejection_comment" text;
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "rejection_at" timestamptz;
