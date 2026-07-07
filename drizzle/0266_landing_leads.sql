-- Заявки с публичного лендинга (Юрий 07.07): реальное предложение —
-- заказать демонстрацию платформы или консультацию (self-service
-- регистрации нет). Форма #request на /landing пишет сюда, POST
-- /api/public/landing-lead шлёт Telegram-алерт владельцу платформы.
-- Аддитивная, идемпотентная миграция.
CREATE TABLE IF NOT EXISTS landing_leads (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  contact    text NOT NULL, -- телефон/telegram/email — как ввёл сам
  company    text,
  interest   text NOT NULL DEFAULT 'demo', -- 'demo' | 'consultation'
  comment    text,
  source     text, -- utm/referrer, опционально
  ip_hash    text, -- sha256(ip + NEXTAUTH_SECRET), антиспам — не сам IP
  status     text NOT NULL DEFAULT 'new', -- 'new' | 'contacted' | 'closed'
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS landing_leads_created_idx ON landing_leads (created_at);
CREATE INDEX IF NOT EXISTS landing_leads_status_idx ON landing_leads (status);
