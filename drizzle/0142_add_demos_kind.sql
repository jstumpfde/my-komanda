-- Этап 2.5: таб «Тест» в вакансии — клон таба «Демонстрация» с отдельной
-- записью в demos. Дискриминатор kind: 'demo' (по умолчанию) | 'test'.
-- Существующие записи получают 'demo' через DEFAULT — миграция данных не нужна.
ALTER TABLE demos ADD COLUMN kind text NOT NULL DEFAULT 'demo';

-- Хук грузит одну запись на вакансию по (vacancy_id, kind) — индекс под этот запрос.
CREATE INDEX idx_demos_vacancy_kind ON demos(vacancy_id, kind);
