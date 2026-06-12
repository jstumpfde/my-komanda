-- Миграция 0206: менеджер пресетов дожима — СВОИ пресеты HR компании.
-- Системные (soft/standard/aggressive) виртуальны, в таблице не хранятся.
-- Идемпотентна.

CREATE TABLE IF NOT EXISTS company_followup_presets (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name                 text NOT NULL,
  description          text,
  preset               text NOT NULL DEFAULT 'standard',
  custom_days          jsonb,
  messages             jsonb,
  messages_opened      jsonb,
  test_preset          text,
  test_messages        jsonb,
  test_messages_opened jsonb,
  created_by           uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cfp_company ON company_followup_presets(company_id);
