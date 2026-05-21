-- P0-49: уникальный индекс (company_id, hh_vacancy_id) для hh_vacancies.
-- Прод уже накатан руками; миграция повторяет это для других окружений.

-- 1) Удалить дубли: оставляем запись с большим responses_count
--    (а при равенстве — с большим id).
DELETE FROM hh_vacancies hv1
USING hh_vacancies hv2
WHERE hv1.company_id = hv2.company_id
  AND hv1.hh_vacancy_id = hv2.hh_vacancy_id
  AND (
    hv1.responses_count < hv2.responses_count
    OR (hv1.responses_count = hv2.responses_count AND hv1.id < hv2.id)
  );

-- 2) Уникальный индекс — больше дублей не будет.
CREATE UNIQUE INDEX IF NOT EXISTS hh_vacancies_unique_company_hhid
ON hh_vacancies(company_id, hh_vacancy_id);
