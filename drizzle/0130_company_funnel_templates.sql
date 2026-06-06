-- Group 15: библиотека шаблонов воронки на уровне компании.
--
-- Сейчас (Group 12) шаблоны воронки хардкожены в lib/funnel-builder/blocks.ts
-- (simple, with_test, with_chatbot, full). HR не может сохранить свой
-- настроенный набор блоков как именованный шаблон.
--
-- company_funnel_templates — пер-компанийная библиотека шаблонов. Каждый
-- шаблон хранит сериализованный массив блоков (config_json) — тот же формат,
-- что лежит в vacancies.funnel_config_json (массив { type, order, enabled }).
-- При применении шаблон копирует config_json в vacancy.funnel_config_json.
--
-- is_default = true означает «использовать как стартовый шаблон при создании
-- новой вакансии». В компании может быть только один default-шаблон —
-- инвариант поддерживается на уровне API (при ставке is_default=true для
-- одного шаблона остальные сбрасываются). Здесь добавлен частичный
-- уникальный индекс как safety net.

CREATE TABLE IF NOT EXISTS company_funnel_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name            text NOT NULL,
  description     text,
  config_json     jsonb NOT NULL,
  is_default      boolean NOT NULL DEFAULT false,
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cft_company
  ON company_funnel_templates(company_id);

-- Safety net: только один default-шаблон на компанию.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_cft_default_per_company
  ON company_funnel_templates(company_id)
  WHERE is_default = true;
