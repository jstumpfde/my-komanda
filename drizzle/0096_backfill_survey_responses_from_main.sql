-- Однократный backfill для блока «Данные из анкеты».
--
-- Контекст: коммит 53f3b15 ввёл новое поле candidates.survey_responses
-- и UI-блок «Данные из анкеты» в карточке кандидата (drawer, вкладка
-- «Ответы»). Старые анкеты, заполненные до деплоя 53f3b15, писали
-- контакты сразу в основные поля кандидата (name/phone/email/city) и
-- ничего не клали в survey_responses — поэтому у Юрия блок отсутствовал
-- даже у тех, кто статус anketa_filled уже прошёл.
--
-- Бэкфилим только не-hh кандидатов: для hh-карточек name/phone/email —
-- это hh-данные, не анкета (см. логику feat/anketa-extends-hh-card).
-- У hh-кандидатов с anketa_filled (которых на момент написания скрипта
-- 0 шт) данные из анкеты восстановить нельзя — они никуда не сохранялись.
--
-- Идемпотентно: WHERE survey_responses IS NULL.
-- Маркер `_backfilled = "from_main_fields_2026-05-09"` оставляем в JSONB,
-- чтобы при следующих расследованиях видеть, что значения восстановлены,
-- а не введены пользователем.

UPDATE candidates c
SET survey_responses = jsonb_strip_nulls(jsonb_build_object(
  'filledAt',    to_char(c.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'firstName',   NULLIF(split_part(trim(c.name), ' ', 1), ''),
  'lastName',    NULLIF(trim(regexp_replace(trim(c.name), '^[^ ]+ ?', '')), ''),
  'phone',       c.phone,
  'email',       c.email,
  'city',        c.city,
  'birthDate',   to_char(c.birth_date, 'YYYY-MM-DD'),
  '_backfilled', 'from_main_fields_2026-05-09'
))
WHERE c.survey_responses IS NULL
  AND NOT EXISTS (SELECT 1 FROM hh_candidates hc WHERE hc.candidate_id = c.id)
  AND (c.stage = 'anketa_filled' OR c.stage_history::text LIKE '%anketa_filled%');
