-- Внутренние «наборы сравнения» для коротких HR-ссылок вида
-- /hr/vacancies/[id]/compare?set=<token>. В отличие от compare_shares —
-- БЕЗ срока жизни и БЕЗ публичного доступа (только под авторизацией HR).
-- token — короткий идентификатор набора кандидатов в URL.
CREATE TABLE IF NOT EXISTS compare_sets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token         text NOT NULL UNIQUE,
  company_id    uuid NOT NULL,
  vacancy_id    uuid NOT NULL,
  candidate_ids jsonb NOT NULL,
  created_by    uuid,
  created_at    timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_compare_sets_token ON compare_sets (token);
