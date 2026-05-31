-- 0159_outbound_sourcing.sql
-- Модуль «Исходящий подбор» (hh outbound sourcing), Фаза 1.
-- Идемпотентно: CREATE TABLE IF NOT EXISTS, без DROP.
--
-- Три таблицы:
--   outbound_searches      — сохранённые поисковые запросы (критерии) по вакансии
--   outbound_candidates    — найденные резюме из поиска hh + AI-скоринг по сниппету
--   hh_resume_view_quota   — учёт расхода дневного лимита просмотров hh по компании
--
-- Связи с companies/vacancies/candidates — ON DELETE CASCADE для company/vacancy,
-- SET NULL для candidate_id (кандидат может быть удалён независимо).

CREATE TABLE IF NOT EXISTS outbound_searches (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  vacancy_id          uuid NOT NULL REFERENCES vacancies(id) ON DELETE CASCADE,
  criteria            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id  uuid REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  last_run_at         timestamptz
);

CREATE INDEX IF NOT EXISTS idx_outbound_searches_company  ON outbound_searches (company_id);
CREATE INDEX IF NOT EXISTS idx_outbound_searches_vacancy  ON outbound_searches (vacancy_id);

CREATE TABLE IF NOT EXISTS outbound_candidates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id       uuid NOT NULL REFERENCES outbound_searches(id) ON DELETE CASCADE,
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  vacancy_id      uuid NOT NULL REFERENCES vacancies(id) ON DELETE CASCADE,
  hh_resume_id    text NOT NULL,
  title           text,
  snippet         jsonb,
  ai_score        integer,
  ai_reasoning    text,
  -- found | viewed | invited | responded | skipped
  status          text NOT NULL DEFAULT 'found',
  invited_at      timestamptz,
  viewed_at       timestamptz,
  candidate_id    uuid REFERENCES candidates(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Дедуп резюме в рамках вакансии: одно и то же hh_resume_id не показываем дважды.
CREATE UNIQUE INDEX IF NOT EXISTS uq_outbound_candidates_vacancy_resume
  ON outbound_candidates (vacancy_id, hh_resume_id);
CREATE INDEX IF NOT EXISTS idx_outbound_candidates_search   ON outbound_candidates (search_id);
CREATE INDEX IF NOT EXISTS idx_outbound_candidates_company  ON outbound_candidates (company_id);

CREATE TABLE IF NOT EXISTS hh_resume_view_quota (
  company_id          uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  date                date NOT NULL,
  -- Просмотры резюме из поисковой выдачи (лимит 50/день на менеджера).
  views_from_search   integer NOT NULL DEFAULT 0,
  -- Суммарные уникальные просмотры (лимит 500/день).
  total_views         integer NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, date)
);
