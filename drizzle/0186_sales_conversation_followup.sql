-- Sales: поля дожима на диалоге. booked_at — когда создана бронь (исключает из
-- дожима); followup_count/last_followup_at — учёт касаний дожима.
ALTER TABLE "sales_conversations" ADD COLUMN IF NOT EXISTS "booked_at" timestamp;
ALTER TABLE "sales_conversations" ADD COLUMN IF NOT EXISTS "followup_count" integer DEFAULT 0;
ALTER TABLE "sales_conversations" ADD COLUMN IF NOT EXISTS "last_followup_at" timestamp;
