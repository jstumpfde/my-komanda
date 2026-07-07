-- 0260: Модуль «Типология» — AI-разбор личности по дате рождения (/tip +
-- телеграм-бот позже). Слой данных: пользователи модуля, прогоны разбора,
-- редактируемые слои промптов (методика НЕ зашита в код), промокоды/активации,
-- заготовка оплаты (отключена на старте), доп. вопросы к готовому разбору.

CREATE TABLE IF NOT EXISTS tip_users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tg_chat_id    bigint UNIQUE,
  email         text,
  display_name  text,
  balance_runs  integer NOT NULL DEFAULT 0,
  prefs_json    jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tip_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES tip_users(id) ON DELETE CASCADE,
  input_json    jsonb NOT NULL,
  formula_json  jsonb,
  status        text NOT NULL DEFAULT 'pending', -- pending|generating|done|error
  result_md     text,
  error_text    text,
  model         text,
  tokens_in     integer,
  tokens_out    integer,
  cost_usd      numeric(10,6),
  share_token   text UNIQUE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz
);

CREATE TABLE IF NOT EXISTS tip_prompt_layers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  layer_key   text NOT NULL UNIQUE,
  title       text NOT NULL,
  content     text NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tip_promo_codes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code               text NOT NULL UNIQUE,
  runs_granted       integer NOT NULL,
  max_activations    integer,           -- null = без лимита
  activations_count  integer NOT NULL DEFAULT 0,
  is_free_link       boolean NOT NULL DEFAULT false,
  source_label       text,
  expires_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tip_promo_activations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_id    uuid NOT NULL REFERENCES tip_promo_codes(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES tip_users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tip_promo_activations_promo_user_uq UNIQUE (promo_id, user_id)
);

CREATE TABLE IF NOT EXISTS tip_payments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES tip_users(id) ON DELETE CASCADE,
  amount_rub    integer NOT NULL,
  runs_granted  integer NOT NULL,
  provider      text,
  external_id   text,
  status        text NOT NULL DEFAULT 'created',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tip_questions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id      uuid NOT NULL REFERENCES tip_runs(id) ON DELETE CASCADE,
  question    text NOT NULL,
  answer_md   text,
  status      text NOT NULL DEFAULT 'pending',
  tokens_in   integer,
  tokens_out  integer,
  cost_usd    numeric(10,6),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tip_runs_user_idx ON tip_runs(user_id);
CREATE INDEX IF NOT EXISTS tip_runs_share_token_idx ON tip_runs(share_token);
CREATE INDEX IF NOT EXISTS tip_promo_codes_code_idx ON tip_promo_codes(code);
CREATE INDEX IF NOT EXISTS tip_promo_activations_promo_idx ON tip_promo_activations(promo_id);

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mykomanda;
