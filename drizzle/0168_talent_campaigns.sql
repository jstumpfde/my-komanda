-- Резерв (Talent Pool) → Кампании прогрева. Управляемая сущность кампании.
-- Реальная отправка касаний кандидатам — отдельная фича (outward), счётчики
-- стартуют с 0 и растут, когда подключим рассылку.
CREATE TABLE IF NOT EXISTS talent_campaigns (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name          text NOT NULL,
  status        text NOT NULL DEFAULT 'active',   -- 'active' | 'paused'
  channel       text NOT NULL DEFAULT 'email',    -- 'email' | 'telegram' | 'both'
  sent_count    integer NOT NULL DEFAULT 0,
  opened_count  integer NOT NULL DEFAULT 0,
  replied_count integer NOT NULL DEFAULT 0,
  created_at    timestamp DEFAULT now(),
  updated_at    timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_talent_campaigns_company ON talent_campaigns(company_id);
