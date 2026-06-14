-- Миграция 0209: раздельные Имя/Фамилия для пользователей
-- Идемпотентно (IF NOT EXISTS). Legacy-юзеры получают NULL — UI фолбэчит на name.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "first_name" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_name" text;
