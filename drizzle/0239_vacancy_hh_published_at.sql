-- Дата ПЕРВОЙ публикации вакансии на hh.ru (published_at/created_at из детали
-- /vacancies/{id}). Заполняет крон hh-vacancy-sync. Используется в шапке
-- вакансии для счётчика «X дн.» (сколько вакансия висит на hh) — вместо
-- vacancies.created_at (дата создания у нас). Fallback на created_at, если
-- у вакансии нет hh-привязки или синк ещё не прошёл.
ALTER TABLE vacancies ADD COLUMN IF NOT EXISTS hh_published_at timestamptz;
