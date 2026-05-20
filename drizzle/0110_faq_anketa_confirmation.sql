-- Сессия 7: чистка старых message_templates + дефолты для FAQ и
-- anketaConfirmation.
--
-- Старые поля жили в:
--   vacancies.description_json.automation.messageTemplates  (5 ключей: salary, demo_invite, soft_reject, info_request, interview_invite)
--   vacancies.description_json.automation.templatesMeta     (master + per-template checkboxes)
--   companies.message_templates (НЕ колонка БД — только localStorage 'mk_hr_message_templates' — чистится в UI)
--
-- Новые поля:
--   vacancies.description_json.faq                          (массив { topic, text })
--   vacancies.description_json.automation.anketaConfirmation { enabled, delayMinutes, messageText }
--
-- Этот SQL обновляет каждую вакансию: удаляет старые ключи и заполняет
-- новые дефолтами, если их ещё нет. Идемпотентно — повторный запуск
-- не перезатирает уже настроенные кастомные FAQ/anketaConfirmation.

-- 1. Удаляем устаревшие automation.messageTemplates и automation.templatesMeta.
UPDATE vacancies
SET description_json = jsonb_set(
  description_json,
  '{automation}',
  COALESCE(description_json->'automation', '{}'::jsonb)
    - 'messageTemplates' - 'templatesMeta'
)
WHERE description_json ? 'automation'
  AND ((description_json->'automation') ? 'messageTemplates'
    OR (description_json->'automation') ? 'templatesMeta');

-- 2. Заполняем faq дефолтным набором (6 тем) для тех, у кого его ещё нет.
UPDATE vacancies
SET description_json = jsonb_set(
  COALESCE(description_json, '{}'::jsonb),
  '{faq}',
  '[
    { "topic": "Зарплата",      "text": "Здравствуйте, {имя}! Зарплата на позиции {должность} составляет {зп_от} — {зп_до} ₽. Подробнее об условиях — в презентации должности: {ссылка_на_демонстрацию}" },
    { "topic": "Формат работы", "text": "Здравствуйте, {имя}! По «{должность}» формат работы — офис. Подробнее в демонстрации: {ссылка_на_демонстрацию}" },
    { "topic": "График",        "text": "Здравствуйте, {имя}! График — Пн–Пт, 09:00–18:00. Подробнее о режиме работы в презентации: {ссылка_на_демонстрацию}" },
    { "topic": "Локация",       "text": "Здравствуйте, {имя}! Офис находится в Москве. Точный адрес и условия — в демонстрации должности: {ссылка_на_демонстрацию}" },
    { "topic": "Оформление",    "text": "Здравствуйте, {имя}! Оформление по ТК РФ с первого дня. Подробнее о социальном пакете — в презентации: {ссылка_на_демонстрацию}" },
    { "topic": "Опыт",          "text": "Здравствуйте, {имя}! Требования к опыту по «{должность}» подробно описаны в демонстрации: {ссылка_на_демонстрацию}. После просмотра сможем оценить вашу кандидатуру точнее." }
  ]'::jsonb
)
WHERE NOT (description_json ? 'faq')
   OR jsonb_typeof(description_json->'faq') <> 'array'
   OR jsonb_array_length(description_json->'faq') = 0;

-- 3. Заполняем automation.anketaConfirmation дефолтом, если ещё не настроено.
UPDATE vacancies
SET description_json = jsonb_set(
  COALESCE(description_json, '{}'::jsonb),
  '{automation,anketaConfirmation}',
  '{
    "enabled": true,
    "delayMinutes": 3,
    "messageText": "{Имя}, спасибо! Мы получили ваши данные и ответы. В ближайшие дни рассмотрим кандидатуру и свяжемся. Хорошего дня!"
  }'::jsonb,
  true
)
WHERE (description_json->'automation') IS NULL
   OR NOT ((description_json->'automation') ? 'anketaConfirmation');
