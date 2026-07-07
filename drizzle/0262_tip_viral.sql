-- 0261: Типология — виральность (аналитика чтения расшаренного разбора +
-- реферальная механика «Подари разбор» + платформенные настройки модуля).
--
-- ALTER на существующие tip_users/tip_runs (0260) — новые колонки nullable
-- либо с default, безопасно на непустых таблицах. Три новые таблицы:
-- tip_share_views (кто/сколько смотрел расшаренный разбор), tip_referrals
-- (реферальные цепочки приглашений со статусом активации), tip_settings
-- (редактируемые пороги/размеры бонусов — НЕ зашиты в код).

ALTER TABLE tip_users ADD COLUMN IF NOT EXISTS ref_code text UNIQUE;
ALTER TABLE tip_users ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES tip_users(id);

ALTER TABLE tip_runs ADD COLUMN IF NOT EXISTS highlights_json jsonb;
ALTER TABLE tip_runs ADD COLUMN IF NOT EXISTS views_count integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS tip_share_views (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id           uuid NOT NULL REFERENCES tip_runs(id) ON DELETE CASCADE,
  viewer_uid       uuid NOT NULL,
  source           text,
  seconds_visible  integer NOT NULL DEFAULT 0,
  max_scroll_pct   integer NOT NULL DEFAULT 0,
  first_at         timestamptz NOT NULL DEFAULT now(),
  last_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tip_share_views_run_viewer_uq UNIQUE (run_id, viewer_uid)
);
CREATE INDEX IF NOT EXISTS tip_share_views_run_idx ON tip_share_views (run_id);

CREATE TABLE IF NOT EXISTS tip_referrals (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id   uuid NOT NULL REFERENCES tip_users(id) ON DELETE CASCADE,
  referred_user_id   uuid NOT NULL UNIQUE REFERENCES tip_users(id) ON DELETE CASCADE,
  status             text NOT NULL DEFAULT 'pending', -- pending|activated
  bonus_granted_at   timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tip_settings (
  key         text PRIMARY KEY,
  value_json  jsonb NOT NULL
);

INSERT INTO tip_settings (key, value_json) VALUES
  ('referral_welcome_runs', '1'),
  ('referral_bonus_runs', '1'),
  ('referral_monthly_cap', '10'),
  ('view_notify_thresholds', '[1,5,10,25,50,100]')
ON CONFLICT (key) DO NOTHING;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mykomanda;
