-- Описание компании для вакансий (подтягивается в анкету вакансии)

ALTER TABLE companies ADD COLUMN IF NOT EXISTS company_description TEXT;
