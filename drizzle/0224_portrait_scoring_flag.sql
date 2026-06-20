-- «Портрет» как единственный источник оценки (новый контур) — per-vacancy флаг.
-- true: критерии + пороги + жёсткость берутся из vacancy_specs (Spec).
-- false (дефолт): прежнее legacy-поведение (ai_process_settings + конструктор).
-- Новые вакансии создаются с true; существующие переводятся вручную.
ALTER TABLE vacancies ADD COLUMN IF NOT EXISTS portrait_scoring boolean NOT NULL DEFAULT false;
