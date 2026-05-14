CREATE TABLE IF NOT EXISTS vacancy_utm_links (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vacancy_id       uuid NOT NULL REFERENCES vacancies(id) ON DELETE CASCADE,
  source           text NOT NULL,
  name             text NOT NULL,
  slug             text NOT NULL UNIQUE,
  destination_url  text,
  clicks           integer DEFAULT 0,
  candidates_count integer DEFAULT 0,
  created_at       timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vacancy_utm_links_vacancy_id_idx ON vacancy_utm_links (vacancy_id);
