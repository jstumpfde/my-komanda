-- Резерв → Формы: tracking-ссылки /f/{slug} (источник → публичная форма).
CREATE TABLE IF NOT EXISTS form_tracking_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  form_id     uuid REFERENCES talent_forms(id) ON DELETE SET NULL,
  source      text NOT NULL DEFAULT '',
  name        text NOT NULL DEFAULT '',
  slug        text NOT NULL,
  clicks      integer NOT NULL DEFAULT 0,
  candidates  integer NOT NULL DEFAULT 0,
  created_at  timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_form_tracking_links_company ON form_tracking_links(company_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_form_tracking_links_slug ON form_tracking_links(slug);
