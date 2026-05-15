-- Валюта ожидаемой зарплаты кандидата. NULL = трактуется как RUB.
-- Источник: hh resume.salary.currency (RUR/EUR/USD/KZT/BYR…).
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS salary_currency TEXT;
