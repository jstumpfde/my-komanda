-- Расширение вакансий: поля hh.ru + AI-скрининг
-- Основные данные анкеты хранятся в description_json.anketa (JSONB),
-- но ключевые поля дублируем в колонках для фильтрации и поиска.

ALTER TABLE "vacancies" ADD COLUMN IF NOT EXISTS "required_experience" varchar(20);
ALTER TABLE "vacancies" ADD COLUMN IF NOT EXISTS "employment_type" text[];
ALTER TABLE "vacancies" ADD COLUMN IF NOT EXISTS "schedule" varchar(20);
ALTER TABLE "vacancies" ADD COLUMN IF NOT EXISTS "hiring_plan" integer DEFAULT 1;
ALTER TABLE "vacancies" ADD COLUMN IF NOT EXISTS "employee_type" varchar(20) DEFAULT 'permanent';
