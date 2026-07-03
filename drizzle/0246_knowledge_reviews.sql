-- Аудит 04.07: таблица knowledge_reviews объявлена в схеме и используется
-- API articles/[id]/reviews, но отсутствовала в прод-БД (гарантированный 500).
CREATE TABLE IF NOT EXISTS knowledge_reviews (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  article_id  uuid NOT NULL REFERENCES knowledge_articles(id) ON DELETE CASCADE,
  author_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  action      text NOT NULL,
  comment     text,
  voice_url   text,
  video_url   text,
  attachments text[],
  created_at  timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS knowledge_reviews_article_idx ON knowledge_reviews(article_id);
