-- Backfill hh_vacancies для уже привязанных вакансий через UI
INSERT INTO hh_vacancies (id, company_id, hh_vacancy_id, title, local_vacancy_id, status, url, synced_at, created_at)
SELECT
  gen_random_uuid(),
  v.company_id,
  v.hh_vacancy_id,
  v.title,
  v.id,
  'active',
  v.hh_url,
  COALESCE(v.hh_synced_at, NOW()),
  NOW()
FROM vacancies v
WHERE v.hh_vacancy_id IS NOT NULL
  AND v.hh_vacancy_id != ''
  AND NOT EXISTS (
    SELECT 1 FROM hh_vacancies hv
    WHERE hv.company_id = v.company_id
      AND hv.hh_vacancy_id = v.hh_vacancy_id
  );
