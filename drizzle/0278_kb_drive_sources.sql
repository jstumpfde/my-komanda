-- База знаний: «Подключённые источники» (концепт kb-connected-sources, фаза 1).
-- Идемпотентно — безопасно перезапускать (IF NOT EXISTS везде).

CREATE TABLE IF NOT EXISTS knowledge_sources (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  provider            text NOT NULL,
  title               text NOT NULL,
  access_token_enc    text NOT NULL,
  refresh_token_enc   text,
  token_expires_at    timestamptz,
  connected_by        uuid REFERENCES users(id) ON DELETE SET NULL,
  root_folders        jsonb NOT NULL DEFAULT '[]',
  status              text NOT NULL DEFAULT 'active',
  last_sync_at        timestamptz,
  last_full_crawl_at  timestamptz,
  last_error          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS knowledge_sources_tenant_idx ON knowledge_sources(tenant_id);

CREATE TABLE IF NOT EXISTS knowledge_source_documents (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  source_id             uuid NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
  external_path         text NOT NULL,
  name                  text NOT NULL,
  mime_type             text,
  size_bytes            integer,
  provider_modified_at  timestamptz,
  content_hash          text,
  status                text NOT NULL DEFAULT 'pending',
  skip_reason           text,
  text_chars            integer,
  tokens_spent          integer,
  ai_opt_out            boolean NOT NULL DEFAULT false,
  last_indexed_at       timestamptz,
  deleted_at            timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS knowledge_source_documents_source_path_uq
  ON knowledge_source_documents(source_id, external_path);
CREATE INDEX IF NOT EXISTS knowledge_source_documents_tenant_idx ON knowledge_source_documents(tenant_id);
CREATE INDEX IF NOT EXISTS knowledge_source_documents_source_idx ON knowledge_source_documents(source_id);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_id  uuid NOT NULL REFERENCES knowledge_source_documents(id) ON DELETE CASCADE,
  ord          integer NOT NULL,
  text         text NOT NULL,
  text_hash    text NOT NULL,
  embedding    jsonb,
  token_count  integer,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS knowledge_chunks_tenant_document_idx ON knowledge_chunks(tenant_id, document_id);
