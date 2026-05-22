-- Group 16: библиотека шаблонов воронки на уровне платформы.
--
-- Platform-admin может «добыть» удачно настроенный funnel_config_json
-- из любой вакансии и сохранить его как шаблон, доступный всем компаниям.
-- HR в любой компании видит платформенные шаблоны в выпадающем списке
-- «Применить шаблон» в конструкторе воранки (под секцией «Платформенные»).
--
-- В отличие от company_funnel_templates (Group 15) — эти шаблоны общие
-- для всей платформы. is_published=true → шаблон видно всем компаниям.
-- source_vacancy_id/source_company_id — для аудита, откуда «добыт».

CREATE TABLE IF NOT EXISTS platform_funnel_templates (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text NOT NULL,
  description        text,
  industry           text,
  config_json        jsonb NOT NULL,
  source_vacancy_id  uuid REFERENCES vacancies(id) ON DELETE SET NULL,
  source_company_id  uuid REFERENCES companies(id) ON DELETE SET NULL,
  is_published       boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pft_industry
  ON platform_funnel_templates(industry)
  WHERE is_published = true;

CREATE INDEX IF NOT EXISTS idx_pft_published
  ON platform_funnel_templates(is_published)
  WHERE is_published = true;
