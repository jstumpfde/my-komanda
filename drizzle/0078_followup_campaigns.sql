-- Follow-up Campaigns (Воронка дожима) — TZ-5/2

CREATE TABLE IF NOT EXISTS follow_up_campaigns (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vacancy_id             uuid NOT NULL REFERENCES vacancies(id) ON DELETE CASCADE,
  preset                 text NOT NULL DEFAULT 'off',
  enabled                boolean NOT NULL DEFAULT false,
  stop_on_reply          boolean NOT NULL DEFAULT true,
  stop_on_vacancy_closed boolean NOT NULL DEFAULT true,
  custom_messages        jsonb,
  created_at             timestamp NOT NULL DEFAULT now(),
  updated_at             timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_followup_campaigns_vacancy
  ON follow_up_campaigns (vacancy_id);

CREATE TABLE IF NOT EXISTS follow_up_messages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   uuid NOT NULL REFERENCES follow_up_campaigns(id) ON DELETE CASCADE,
  candidate_id  uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  scheduled_at  timestamp NOT NULL,
  sent_at       timestamp,
  touch_number  integer NOT NULL,
  channel       text NOT NULL,
  message_text  text NOT NULL,
  status        text NOT NULL DEFAULT 'pending',
  error_message text,
  created_at    timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_followup_messages_candidate_status
  ON follow_up_messages (candidate_id, status);

CREATE INDEX IF NOT EXISTS idx_followup_messages_scheduled_status
  ON follow_up_messages (scheduled_at, status);
