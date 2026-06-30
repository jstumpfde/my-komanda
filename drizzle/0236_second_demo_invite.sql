-- 0236: «2-я часть демо» (Путь менеджера) после прохождения анкеты.
-- Per-candidate override блока демо + отметка времени приглашения.
-- Аддитивно/nullable — поведения не меняет, пока anketaPassInvite.enabled=false.

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS override_content_block_id text,
  ADD COLUMN IF NOT EXISTS second_demo_invited_at    timestamptz;
