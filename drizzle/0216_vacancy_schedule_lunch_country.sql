-- Миграция 0216: расписание вакансии — обеденный перерыв и страна календаря праздников.
-- Обратная совместимость: lunchEnabled=false (обед выключен), country='RU' (старая логика).
-- Идемпотентна: ADD COLUMN IF NOT EXISTS.

ALTER TABLE vacancies ADD COLUMN IF NOT EXISTS schedule_lunch_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE vacancies ADD COLUMN IF NOT EXISTS schedule_lunch_from    text NOT NULL DEFAULT '13:00';
ALTER TABLE vacancies ADD COLUMN IF NOT EXISTS schedule_lunch_to      text NOT NULL DEFAULT '14:00';
ALTER TABLE vacancies ADD COLUMN IF NOT EXISTS schedule_country       text NOT NULL DEFAULT 'RU';
