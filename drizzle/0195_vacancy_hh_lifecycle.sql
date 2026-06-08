-- Сроки/архив вакансии: состояние публикации на hh + дата нашего закрытия.
-- hh_archived  — вакансии нет в /vacancies/active (ушла в архив hh).
-- hh_expires_at — срок публикации (если hh отдаёт; часто null).
-- closed_at    — когда МЫ закрыли вакансию (может отличаться от hh-архива).
ALTER TABLE vacancies ADD COLUMN IF NOT EXISTS hh_archived boolean;
ALTER TABLE vacancies ADD COLUMN IF NOT EXISTS hh_expires_at timestamptz;
ALTER TABLE vacancies ADD COLUMN IF NOT EXISTS closed_at timestamptz;
