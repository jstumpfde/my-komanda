-- Группа 38: централизованный брендинг компании.
-- Компании уже имеют brand_primary_color/brand_bg_color/brand_text_color/logo_url —
-- это и есть источник истины. Добавляем флаг на вакансии: использовать
-- companies-уровень (DEFAULT false = наследуем) или собственный
-- description_json.branding override.

ALTER TABLE vacancies
  ADD COLUMN IF NOT EXISTS branding_override_enabled boolean NOT NULL DEFAULT false;

-- companies.branding_json — слот для расширенных полей (accent color,
-- font family и т.п.) поверх существующих brand_primary/bg/text_color.
-- DEFAULT '{}' безопасно для существующих компаний.
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS branding_json jsonb NOT NULL DEFAULT '{}'::jsonb;
