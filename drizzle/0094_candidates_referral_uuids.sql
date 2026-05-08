-- Сюда складываются альтернативные токены кандидата при дедупликации
-- (когда тот же человек заполняет анкету по другой реф-ссылке).
-- ТЗ задача 3 (TZ_buttons_statuses_sync_v1.md, P3).
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS referral_uuids JSONB NOT NULL DEFAULT '[]'::jsonb;
