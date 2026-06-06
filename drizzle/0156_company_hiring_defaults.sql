-- 0156_company_hiring_defaults.sql
-- Дефолты компании для всех вакансий (страница HR → Настройки найма):
-- расписание, webhooks, Битрикс24, хранение данных, стоп-факторы-дефолты, автоматизация воронки.
-- Идемпотентная миграция: безопасно запускать повторно.

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS hiring_defaults_json jsonb NOT NULL DEFAULT '{}'::jsonb;
