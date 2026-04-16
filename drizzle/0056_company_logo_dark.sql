-- Вторая версия логотипа для тёмных фонов (sidebar платформы всегда тёмный).
-- Если не задана — используется logo_url.

ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_dark_url TEXT;
