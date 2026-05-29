-- Реальные шаблоны анкет для библиотеки. По образцу demo_templates:
-- per-tenant (tenant_id NULL = системный), soft-delete (deleted_at), системные
-- не удаляются. Вопросы хранятся как Question[] (lib/course-types.ts) — тот же
-- формат, что и vacancies.description_json.anketa.questions, поэтому шаблон
-- применяется к вакансии одной записью (load-from-template).
CREATE TABLE IF NOT EXISTS questionnaire_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid REFERENCES companies(id) ON DELETE CASCADE,
  name        text NOT NULL,
  type        text NOT NULL DEFAULT 'candidate',  -- candidate | client | post_demo
  questions   jsonb NOT NULL DEFAULT '[]',
  is_system   boolean DEFAULT false,
  -- Корзина: NULL — активный; не-NULL — в корзине, cron trash-cleanup удалит
  -- навсегда через companies.trash_retention_days (как demo_templates).
  deleted_at  timestamp,
  created_at  timestamp DEFAULT now(),
  updated_at  timestamp DEFAULT now()
);

-- Активные шаблоны компании.
CREATE INDEX IF NOT EXISTS idx_questionnaire_templates_tenant
  ON questionnaire_templates(tenant_id) WHERE deleted_at IS NULL;

-- Выборка корзины и cron-очистки.
CREATE INDEX IF NOT EXISTS idx_questionnaire_templates_deleted_at
  ON questionnaire_templates(deleted_at) WHERE deleted_at IS NOT NULL;
