-- Миграция 0215: per-company оверрайд видимых модулей сайдбара.
--
-- companies.enabled_modules (jsonb):
--   NULL            — grandfather: модули показываются КАК СЕЙЧАС (по роли и
--                     существующим оверрайдам fullModulesCompany/pilot/staging/owner).
--                     Текущее поведение всех клиентов НЕ меняется.
--   []  (пустой)    — трактуется как NULL (grandfather) — пустой выбор в админке
--                     означает «сбросить оверрайд».
--   ['hr','sales']  — компания видит ИМЕННО эти модули (оверрайд роли); hr всегда
--                     доступен как минимум (гарантируется в сайдбаре).
--
-- Управляется из админки: /admin/clients/[id] → блок «Модули клиента».
-- НЕ включает лицензионный гейтинг tenant_modules — это отдельный, безопасный
-- per-company переключатель видимости.
--
-- Идемпотентная: ADD COLUMN IF NOT EXISTS.

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS enabled_modules jsonb;
