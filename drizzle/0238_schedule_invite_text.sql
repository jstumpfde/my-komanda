-- Настраиваемый текст приглашения на интервью (ссылка /schedule/[token]).
--
-- Раньше текст был захардкожен в DEFAULT_SCHEDULE_INVITE_TEXT
-- (lib/messaging/schedule-invite.ts) и переопределялся только разовым
-- override (body.messageOverride в stage-route). Теперь HR/директор может
-- задать текст per-вакансия в UI (таб «Сообщения» → «Приглашение на интервью»).
--
-- Приоритет в scheduleInterviewInvite:
--   явный messageOverride > schedule_invite_text > DEFAULT_SCHEDULE_INVITE_TEXT.
--
-- Пусто (дефолт) → используется DEFAULT_SCHEDULE_INVITE_TEXT (без hardcoded
-- fallback в БД). Плейсхолдеры рендерит cron follow-up:
--   {{name}} {{vacancy}} {{company}} {{schedule_link}} {{manager}}.

ALTER TABLE vacancies
  ADD COLUMN IF NOT EXISTS schedule_invite_text text NOT NULL DEFAULT '';
