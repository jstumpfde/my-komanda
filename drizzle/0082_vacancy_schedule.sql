-- Расписание отправки сообщений на уровне вакансии:
-- часы (start/end) + таймзона + дни недели + праздники РФ + кастомные периоды.
-- Используется в /api/cron/hh-import (приглашение на демо) и
-- /api/cron/follow-up (касания дожима) через lib/schedule/can-send-now.ts.

ALTER TABLE "vacancies"
  ADD COLUMN IF NOT EXISTS "schedule_enabled"  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "schedule_start"    text    NOT NULL DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS "schedule_end"      text    NOT NULL DEFAULT '19:55',
  ADD COLUMN IF NOT EXISTS "schedule_timezone" text    NOT NULL DEFAULT 'Europe/Moscow',
  -- 1=Пн ... 7=Вс. По умолчанию — будни.
  ADD COLUMN IF NOT EXISTS "schedule_working_days"          jsonb NOT NULL DEFAULT '[1,2,3,4,5]'::jsonb,
  -- Идентификаторы из RU_HOLIDAYS (см. lib/schedule/holidays.ts).
  ADD COLUMN IF NOT EXISTS "schedule_excluded_holiday_ids"  jsonb NOT NULL DEFAULT
    '["dec_31","jan_1","jan_2","jan_3","jan_4","jan_5","jan_6","jan_7","jan_8","feb_23","mar_8","may_1","may_9","jun_12","nov_4"]'::jsonb,
  -- [{from:"YYYY-MM-DD",to:"YYYY-MM-DD",label:"..."}].
  ADD COLUMN IF NOT EXISTS "schedule_custom_holidays" jsonb NOT NULL DEFAULT '[]'::jsonb;
