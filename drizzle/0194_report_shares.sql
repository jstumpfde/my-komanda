-- Публичная ссылка на «Отчёт по найму» (share-токен, без логина).
-- Один активный токен на компанию; перегенерация отзывает старый (revoked_at).
CREATE TABLE IF NOT EXISTS report_shares (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token       text NOT NULL UNIQUE,
  company_id  uuid NOT NULL,
  created_by  uuid,
  created_at  timestamptz DEFAULT now(),
  revoked_at  timestamptz
);

CREATE INDEX IF NOT EXISTS report_shares_company_idx ON report_shares (company_id);
