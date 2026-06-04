-- Резерв (Talent Pool) → Формы. Определения форм сбора кандидатов.
-- Публичная отправка формы (inbound) — отдельная фича.
CREATE TABLE IF NOT EXISTS talent_forms (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name               text NOT NULL,
  type               text NOT NULL DEFAULT 'external',   -- 'external' | 'internal'
  source             text NOT NULL DEFAULT '',
  placement          text NOT NULL DEFAULT '',
  slug               text NOT NULL DEFAULT '',
  slogan             text NOT NULL DEFAULT '',
  fields_json        jsonb NOT NULL DEFAULT '[]'::jsonb,
  active             boolean NOT NULL DEFAULT true,
  applications_count integer NOT NULL DEFAULT 0,
  created_at         timestamp DEFAULT now(),
  updated_at         timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_talent_forms_company ON talent_forms(company_id);
