-- 0226: Фаза 0 рантайма воронки v2.
-- Два новых поля:
--   candidates.funnel_v2_state_json — текущее состояние кандидата в v2-воронке
--     (nullable; NULL = едет по легаси-пути; конкретная структура — FunnelV2State).
--   vacancies.funnel_v2_runtime_enabled — фичефлаг per-вакансия (отдельный
--     от funnelRuntimeEnabled, который управляет блоками Funnel Builder).
--
-- Риск: минимальный (только nullable/boolean DEFAULT false поля; легаси не трогаем).
-- Применять при деплое вручную, как обычно.

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS funnel_v2_state_json jsonb;

ALTER TABLE vacancies
  ADD COLUMN IF NOT EXISTS funnel_v2_runtime_enabled boolean NOT NULL DEFAULT false;

-- Конвенция проекта: новые таблицы/колонки доступны приложению.
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mykomanda;
