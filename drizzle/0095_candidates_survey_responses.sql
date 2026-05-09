-- 0095: candidates.survey_responses
-- Снимок данных, которые кандидат указал в анкете при заполнении формы
-- по демо-токену (firstName, lastName, phone, email, city, birthDate,
-- telegram, portfolioUrl, hhUrl, otherLinks, experienceSummary,
-- employmentPreference, niches, filledAt).
--
-- Зачем отдельное поле, а не anketa_answers:
--  anketa_answers занят массивом ответов кандидата по блокам демо
--  (см. /api/public/demo/[token]/answer и /upload-media). Если писать
--  туда же сериализованную форму через {...prev, ...cleanAnketa}, массив
--  блоков превращается в объект с числовыми ключами и AnswersTab/
--  upload-media ломаются. survey_responses — отдельный JSONB-снимок.
--
-- НЕ перезаписывает основные поля candidates.name/phone/email/city/
-- birth_date — те приходят из hh.ru / ручного ввода HR. survey_responses
-- НЕ используется в фильтрах и дедупликации.
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS survey_responses JSONB;
COMMENT ON COLUMN candidates.survey_responses IS 'Снимок ответов кандидата при заполнении анкеты по демо-токену. Не перезаписывает основные поля name/phone/email/city/birth_date (источник истины — hh.ru или ручной ввод HR). Не используется в фильтрах и дедупликации.';
