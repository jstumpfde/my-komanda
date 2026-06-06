-- Публичные ссылки на сравнение кандидатов (открытие без логина).
-- token — секрет в URL; срок жизни expires_at (по умолчанию 7 дней),
-- можно отозвать (revoked_at). Читает только перечисленных кандидатов.
CREATE TABLE IF NOT EXISTS compare_shares (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token         text NOT NULL UNIQUE,
  company_id    uuid NOT NULL,
  vacancy_id    uuid NOT NULL,
  candidate_ids jsonb NOT NULL,
  created_by    uuid,
  created_at    timestamptz DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz
);
CREATE INDEX IF NOT EXISTS idx_compare_shares_token ON compare_shares (token);
