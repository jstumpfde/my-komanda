-- Миграция 0205: ручная коррекция имени кандидата для подстановки {{name}}.
-- HR правит имя в ревизии очереди (когда hh-поля перепутаны/имя неизвестно).
-- NULL = имя определяется автоматически (pickGivenName по словарю). Идемпотентна.

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS first_name_override text;
