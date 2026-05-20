-- P0-1: Унификация плейсхолдеров к canonical mustache-синтаксису {{...}}.
--
-- Backstory:
--   В системе одновременно жили 5 разных форматов плейсхолдеров —
--   {{name}}, {имя}, {Имя}, [Имя], {ссылка_на_демонстрацию} и др.
--   Risk: кандидат мог получить «{Имя}, спасибо!» если в шаблоне был
--   один формат, а cron вставлял другой. Эта миграция нормализует все
--   персистентные шаблоны в БД к canonical {{key}}.
--
-- ТАБЛИЦЫ, КОТОРЫЕ МИГРАЦИЯ ТРОГАЕТ (бэкап рекомендован перед запуском):
--   - vacancies.description_json       (целиком, через text::jsonb)
--   - vacancies.ai_process_settings    (целиком, через text::jsonb)
--   - follow_up_campaigns.custom_messages         (массив строк)
--   - follow_up_campaigns.custom_messages_opened  (массив строк)
--   - follow_up_messages.message_text             (одиночная строка)
--
-- ТАБЛИЦЫ, КОТОРЫЕ НЕ ТРОГАЕМ (упомянуты в исходном ТЗ, но не существуют
-- в схеме — verifyed через grep по lib/db/schema.ts):
--   - companies.hiring_settings              ← колонки нет
--   - vacancies.dozhim_settings              ← колонки нет (тексты дожима
--                                              живут в follow_up_campaigns)
--   - description_json.messageTemplates      ← удалён в Сессии 7 (миграция 0110)
--
-- ПОДХОД:
--   Для JSON-колонок (description_json, ai_process_settings) используем
--   regexp_replace по text-репрезентации с обратной конвертацией в jsonb.
--   Это безопасно, потому что ни один JSON-ключ в наших данных не содержит
--   паттернов вроде «{Имя}» / «[ссылка]» — только VALUES.
--   Применяем 13 последовательных regexp_replace в порядке от более длинных
--   к более коротким (важно для {ссылка_на_демонстрацию} vs {ссылка}).

-- ─── 1. vacancies.description_json ───────────────────────────────────
UPDATE vacancies
SET description_json = (
  regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  regexp_replace(
                    regexp_replace(
                      regexp_replace(
                        regexp_replace(
                          regexp_replace(
                            description_json::text,
                            '\{ссылка_на_демонстрацию\}', '{{demo_link}}', 'g'
                          ),
                          '\[Имя\]', '{{name}}', 'g'
                        ),
                        '\{Имя\}', '{{name}}', 'g'
                      ),
                      '\{имя\}', '{{name}}', 'g'
                    ),
                    '\[должность\]', '{{vacancy}}', 'g'
                  ),
                  '\{должность\}', '{{vacancy}}', 'g'
                ),
                '\{Должность\}', '{{vacancy}}', 'g'
              ),
              '\[компания\]', '{{company}}', 'g'
            ),
            '\{компания\}', '{{company}}', 'g'
          ),
          '\[ссылка\]', '{{demo_link}}', 'g'
        ),
        '\{ссылка\}', '{{demo_link}}', 'g'
      ),
      '\{зп_от\}', '{{salary_from}}', 'g'
    ),
    '\{зп_до\}', '{{salary_to}}', 'g'
  )
)::jsonb
WHERE description_json IS NOT NULL
  AND description_json::text ~ '(\[Имя\]|\{Имя\}|\{имя\}|\[должность\]|\{должность\}|\{Должность\}|\[компания\]|\{компания\}|\[ссылка\]|\{ссылка\}|\{ссылка_на_демонстрацию\}|\{зп_от\}|\{зп_до\}|\{дата_время\})';

-- Отдельный pass для {дата_время} → {{interview_at}} (длиннее vs зп_*).
UPDATE vacancies
SET description_json = (
  regexp_replace(description_json::text, '\{дата_время\}', '{{interview_at}}', 'g')
)::jsonb
WHERE description_json IS NOT NULL
  AND description_json::text ~ '\{дата_время\}';

-- ─── 2. vacancies.ai_process_settings ────────────────────────────────
UPDATE vacancies
SET ai_process_settings = (
  regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  regexp_replace(
                    regexp_replace(
                      regexp_replace(
                        regexp_replace(
                          regexp_replace(
                            regexp_replace(
                              ai_process_settings::text,
                              '\{ссылка_на_демонстрацию\}', '{{demo_link}}', 'g'
                            ),
                            '\[Имя\]', '{{name}}', 'g'
                          ),
                          '\{Имя\}', '{{name}}', 'g'
                        ),
                        '\{имя\}', '{{name}}', 'g'
                      ),
                      '\[должность\]', '{{vacancy}}', 'g'
                    ),
                    '\{должность\}', '{{vacancy}}', 'g'
                  ),
                  '\{Должность\}', '{{vacancy}}', 'g'
                ),
                '\[компания\]', '{{company}}', 'g'
              ),
              '\{компания\}', '{{company}}', 'g'
            ),
            '\[ссылка\]', '{{demo_link}}', 'g'
          ),
          '\{ссылка\}', '{{demo_link}}', 'g'
        ),
        '\{зп_от\}', '{{salary_from}}', 'g'
      ),
      '\{зп_до\}', '{{salary_to}}', 'g'
    ),
    '\{дата_время\}', '{{interview_at}}', 'g'
  )
)::jsonb
WHERE ai_process_settings IS NOT NULL
  AND ai_process_settings::text ~ '(\[Имя\]|\{Имя\}|\{имя\}|\[должность\]|\{должность\}|\{Должность\}|\[компания\]|\{компания\}|\[ссылка\]|\{ссылка\}|\{ссылка_на_демонстрацию\}|\{зп_от\}|\{зп_до\}|\{дата_время\})';

-- ─── 3. follow_up_campaigns.custom_messages / custom_messages_opened ─
-- Тексты дожима (массивы строк по 9 элементов).
UPDATE follow_up_campaigns
SET custom_messages = (
  regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  regexp_replace(
                    regexp_replace(
                      regexp_replace(
                        regexp_replace(
                          regexp_replace(
                            custom_messages::text,
                            '\{ссылка_на_демонстрацию\}', '{{demo_link}}', 'g'
                          ),
                          '\[Имя\]', '{{name}}', 'g'
                        ),
                        '\{Имя\}', '{{name}}', 'g'
                      ),
                      '\{имя\}', '{{name}}', 'g'
                    ),
                    '\[должность\]', '{{vacancy}}', 'g'
                  ),
                  '\{должность\}', '{{vacancy}}', 'g'
                ),
                '\{Должность\}', '{{vacancy}}', 'g'
              ),
              '\[компания\]', '{{company}}', 'g'
            ),
            '\{компания\}', '{{company}}', 'g'
          ),
          '\[ссылка\]', '{{demo_link}}', 'g'
        ),
        '\{ссылка\}', '{{demo_link}}', 'g'
      ),
      '\{зп_от\}', '{{salary_from}}', 'g'
    ),
    '\{зп_до\}', '{{salary_to}}', 'g'
  )
)::jsonb
WHERE custom_messages IS NOT NULL
  AND custom_messages::text ~ '(\[Имя\]|\{Имя\}|\{имя\}|\[должность\]|\{должность\}|\{Должность\}|\[компания\]|\{компания\}|\[ссылка\]|\{ссылка\}|\{ссылка_на_демонстрацию\}|\{зп_от\}|\{зп_до\})';

UPDATE follow_up_campaigns
SET custom_messages_opened = (
  regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  regexp_replace(
                    regexp_replace(
                      regexp_replace(
                        regexp_replace(
                          regexp_replace(
                            custom_messages_opened::text,
                            '\{ссылка_на_демонстрацию\}', '{{demo_link}}', 'g'
                          ),
                          '\[Имя\]', '{{name}}', 'g'
                        ),
                        '\{Имя\}', '{{name}}', 'g'
                      ),
                      '\{имя\}', '{{name}}', 'g'
                    ),
                    '\[должность\]', '{{vacancy}}', 'g'
                  ),
                  '\{должность\}', '{{vacancy}}', 'g'
                ),
                '\{Должность\}', '{{vacancy}}', 'g'
              ),
              '\[компания\]', '{{company}}', 'g'
            ),
            '\{компания\}', '{{company}}', 'g'
          ),
          '\[ссылка\]', '{{demo_link}}', 'g'
        ),
        '\{ссылка\}', '{{demo_link}}', 'g'
      ),
      '\{зп_от\}', '{{salary_from}}', 'g'
    ),
    '\{зп_до\}', '{{salary_to}}', 'g'
  )
)::jsonb
WHERE custom_messages_opened IS NOT NULL
  AND custom_messages_opened::text ~ '(\[Имя\]|\{Имя\}|\{имя\}|\[должность\]|\{должность\}|\{Должность\}|\[компания\]|\{компания\}|\[ссылка\]|\{ссылка\}|\{ссылка_на_демонстрацию\}|\{зп_от\}|\{зп_до\})';

-- ─── 4. follow_up_messages.message_text ──────────────────────────────
-- Уже scheduled pending-сообщения: cron подберёт и отрендерит. Поскольку
-- runtime renderTemplate уже поддерживает legacy-форматы, это апдейт
-- ради чистоты и единого отображения в дашбордах/логах, не критично.
UPDATE follow_up_messages
SET message_text =
  regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  regexp_replace(
                    regexp_replace(
                      regexp_replace(
                        regexp_replace(
                          regexp_replace(
                            message_text,
                            '\{ссылка_на_демонстрацию\}', '{{demo_link}}', 'g'
                          ),
                          '\[Имя\]', '{{name}}', 'g'
                        ),
                        '\{Имя\}', '{{name}}', 'g'
                      ),
                      '\{имя\}', '{{name}}', 'g'
                    ),
                    '\[должность\]', '{{vacancy}}', 'g'
                  ),
                  '\{должность\}', '{{vacancy}}', 'g'
                ),
                '\{Должность\}', '{{vacancy}}', 'g'
              ),
              '\[компания\]', '{{company}}', 'g'
            ),
            '\{компания\}', '{{company}}', 'g'
          ),
          '\[ссылка\]', '{{demo_link}}', 'g'
        ),
        '\{ссылка\}', '{{demo_link}}', 'g'
      ),
      '\{зп_от\}', '{{salary_from}}', 'g'
    ),
    '\{зп_до\}', '{{salary_to}}', 'g'
  )
WHERE status = 'pending'
  AND message_text ~ '(\[Имя\]|\{Имя\}|\{имя\}|\[должность\]|\{должность\}|\{Должность\}|\[компания\]|\{компания\}|\[ссылка\]|\{ссылка\}|\{ссылка_на_демонстрацию\}|\{зп_от\}|\{зп_до\})';
