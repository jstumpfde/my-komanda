-- Кэш переписки hh в нашей БД: чтобы показывать сохранённую переписку даже
-- когда токен hh отвалился (с плашкой «hh не подключён» снизу чата).
-- При каждом успешном фетче из hh — обновляем кэш; при мёртвом токене —
-- отдаём кэш + флаг hhConnected=false. Идемпотентна.
ALTER TABLE hh_responses
  ADD COLUMN IF NOT EXISTS messages_cache jsonb,
  ADD COLUMN IF NOT EXISTS messages_cached_at timestamptz;
