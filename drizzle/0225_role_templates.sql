-- 0225: шаблоны ролей (ТЗ №2). Тонкая обёртка над контентом найма:
-- анкета (→ questionnaire_templates), демо (→ demo_templates), критерии оценки
-- (CandidateSpec, inline jsonb) и стадии Воронки v2 (FunnelV2Stage[], inline jsonb).
-- По образцу questionnaire_templates/demo_templates: per-tenant (tenant_id NULL =
-- системный), is_system, soft-delete (deleted_at), системные не удаляются.
-- Существующие таблицы НЕ трогаем. Это CREATE TABLE, не DROP+CREATE. Идемпотентно.
CREATE TABLE IF NOT EXISTS role_templates (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                      text UNIQUE,
  name                      text NOT NULL,
  description               text,
  role_category             text,
  is_system                 boolean DEFAULT false,
  tenant_id                 uuid REFERENCES companies(id) ON DELETE CASCADE,
  questionnaire_template_id uuid REFERENCES questionnaire_templates(id) ON DELETE SET NULL,
  demo_template_id          uuid REFERENCES demo_templates(id) ON DELETE SET NULL,
  spec_template             jsonb NOT NULL DEFAULT '{}',
  funnel_v2_template        jsonb NOT NULL DEFAULT '[]',
  scoring_formula           jsonb NOT NULL DEFAULT '{}',
  is_published              boolean DEFAULT false,
  deleted_at                timestamp,
  created_at                timestamp DEFAULT now(),
  updated_at                timestamp DEFAULT now(),
  created_by                uuid REFERENCES users(id) ON DELETE SET NULL
);

-- Системные + опубликованные шаблоны, видимые всем (частый запрос выбора роли).
CREATE INDEX IF NOT EXISTS idx_role_templates_system
  ON role_templates(is_system) WHERE deleted_at IS NULL;

-- Активные шаблоны тенанта.
CREATE INDEX IF NOT EXISTS idx_role_templates_tenant
  ON role_templates(tenant_id) WHERE deleted_at IS NULL;

-- Выборка корзины / cron-очистки.
CREATE INDEX IF NOT EXISTS idx_role_templates_deleted_at
  ON role_templates(deleted_at) WHERE deleted_at IS NOT NULL;

-- Конвенция проекта: новые таблицы доступны приложению.
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mykomanda;
