-- Пер-юзерное хранение последнего выбора сортировки списка кандидатов.
-- Структура: { "key": "<ListSortKey>", "dir": "asc"|"desc" }. NULL — нет
-- сохранённого выбора, при первом визите фронт инжектит дефолт
-- { key: "responseDate", dir: "desc" } и сразу persist'ит его.

ALTER TABLE "user_preferences"
  ADD COLUMN IF NOT EXISTS "candidates_list_sort_json" jsonb;
