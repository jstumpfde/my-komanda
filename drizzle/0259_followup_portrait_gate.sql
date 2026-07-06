-- 0259: Гейт «не дожимать кандидатов с Портретом ниже N».
--
-- Инцидент 06.07.2026 (кандидат Ильин, вакансия 6916): дожим слал
-- комплиментарный текст «ваш опыт нам подходит» кандидату с Портрет-баллом 0,
-- явно отказавшемуся от требования вакансии. HR нужна возможность отключить
-- дожим для низкобалльных кандидатов, не трогая сами тексты (они — шаблоны
-- клиента, редактируются отдельно).
--
-- Дефолт: enabled=false (legacy-инвариант — старые вакансии и Орлинк работают
-- как раньше, поведение не меняется без явного включения HR).
-- Порог: threshold=30 (0..100, применяется к candidates.resume_score).
--
-- Риск: минимальный (nullable/boolean DEFAULT false, DEFAULT 30 колонки).

ALTER TABLE follow_up_campaigns
  ADD COLUMN IF NOT EXISTS min_portrait_score_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS min_portrait_score integer NOT NULL DEFAULT 30;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mykomanda;
