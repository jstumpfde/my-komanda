-- P0-9: пер-юзерный last_seen для расчёта дельты «свежих» кандидатов.
--
-- Сценарий: HR заходит в карточку вакансии → таймстамп обновляется.
-- В шапке и на дашборде показываем COUNT(candidates) с created_at > last_seen
-- ⇒ «+N новых» в /hr/vacancies/[id] и список по вакансиям на /hr/dashboard.
--
-- Если записи нет — все anketa_filled считаются свежими (первое посещение).

CREATE TABLE IF NOT EXISTS user_vacancy_views (
  user_id      uuid NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
  vacancy_id   uuid NOT NULL REFERENCES vacancies(id) ON DELETE CASCADE,
  last_seen_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, vacancy_id)
);

CREATE INDEX IF NOT EXISTS idx_user_vacancy_views_vacancy ON user_vacancy_views(vacancy_id);
