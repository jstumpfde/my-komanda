-- 0234: Content Radar (модуль /kwigtg) — личный «радар контента».
-- Источники: Telegram-каналы, Instagram сохранёнки, Instagram Директ.
-- radar_items = одна единица контента (Reels/пост/сообщение): сырьё + транскрипт
-- + AI-суть + тема/теги + статус «применяю / не применяю».
-- radar_topics = дерево тем/подтем (parent_id). Заполняется воркерами-ингесторами
-- и AI-конвейером (Whisper + Claude). Читается страницей /kwigtg.

CREATE TABLE IF NOT EXISTS radar_topics (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  parent_id   uuid REFERENCES radar_topics(id) ON DELETE CASCADE,
  name        text NOT NULL,
  slug        text,
  color       text,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS radar_topics_company_idx ON radar_topics (company_id);
CREATE INDEX IF NOT EXISTS radar_topics_parent_idx ON radar_topics (parent_id);

CREATE TABLE IF NOT EXISTS radar_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES users(id) ON DELETE SET NULL,
  source          text NOT NULL,                  -- telegram | instagram_saved | instagram_dm
  source_account  text,                           -- откуда (канал/аккаунт), напр. @smm_channel
  viewed_on       text,                           -- на каком моём аккаунте смотрел (для IG)
  external_id     text,                           -- id поста/сообщения в источнике (дедуп)
  url             text,                           -- ссылка на оригинал
  media_type      text,                           -- video | image | text | link
  media_url       text,                           -- сохранённое/удалённое медиа
  title           text,
  raw_text        text,                           -- исходный текст/подпись
  transcript      text,                           -- расшифровка (Whisper) + OCR экрана
  summary         text,                           -- AI-суть «про что»
  topic_id        uuid REFERENCES radar_topics(id) ON DELETE SET NULL,
  tags            jsonb NOT NULL DEFAULT '[]'::jsonb,
  service         text,                           -- сервис/инструмент из контента
  status          text NOT NULL DEFAULT 'new',    -- new | apply | skip | later
  pipeline_status text NOT NULL DEFAULT 'pending',-- pending | transcribed | categorized | error
  captured_at     timestamptz,                    -- когда контент создан/получен
  raw             jsonb,                          -- сырой payload источника
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
-- Дедуп по (источник, внешний id); NULL external_id (ручные) не конфликтуют.
CREATE UNIQUE INDEX IF NOT EXISTS radar_items_source_ext_idx
  ON radar_items (source, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS radar_items_company_idx  ON radar_items (company_id);
CREATE INDEX IF NOT EXISTS radar_items_user_idx     ON radar_items (user_id);
CREATE INDEX IF NOT EXISTS radar_items_topic_idx    ON radar_items (topic_id);
CREATE INDEX IF NOT EXISTS radar_items_status_idx   ON radar_items (status);
CREATE INDEX IF NOT EXISTS radar_items_source_idx   ON radar_items (source);
CREATE INDEX IF NOT EXISTS radar_items_captured_idx ON radar_items (captured_at DESC);

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mykomanda;
