-- Сторож найма (Юрий 07.07): периодическая проверка hh-соединения, импорта
-- откликов, разбора очереди, отправок и кронов по вакансиям. Что может —
-- чинит сам (см. lib/hiring-watchdog/*), что не может — пишет сюда алерт.
-- CRITICAL летит в Telegram немедленно, warning только в UI-баннере.
--
-- company_id = NULL — платформенный алерт (виден только platform_admin).
-- dedup_key — стабильный ключ инцидента; пока открытый алерт с таким ключом
-- существует, повторные прогоны крона не плодят дубли (partial unique index
-- на dedup_key WHERE status='open' — после resolve тот же ключ может открыться
-- заново). Аддитивная, идемпотентная миграция.
CREATE TABLE IF NOT EXISTS admin_alerts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid REFERENCES companies(id) ON DELETE CASCADE,
  severity       text NOT NULL, -- 'critical' | 'warning' | 'info'
  source         text NOT NULL, -- напр. 'hiring_watchdog'
  dedup_key      text NOT NULL,
  title          text NOT NULL,
  message        text NOT NULL,
  action_url     text,
  status         text NOT NULL DEFAULT 'open', -- 'open' | 'acked' | 'resolved'
  created_at     timestamptz NOT NULL DEFAULT now(),
  acked_at       timestamptz,
  acked_by       uuid REFERENCES users(id),
  resolved_at    timestamptz,
  auto_resolved  boolean NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_alerts_open_dedup_idx
  ON admin_alerts (dedup_key) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS admin_alerts_company_status_idx ON admin_alerts (company_id, status);
CREATE INDEX IF NOT EXISTS admin_alerts_created_idx ON admin_alerts (created_at);
