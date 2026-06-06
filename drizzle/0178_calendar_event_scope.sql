-- Категория события: company (общая) | hr (HR-отдел) | personal (личное).
-- Фильтр «HR» в календаре теперь показывает только события с scope = 'hr'.
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'company';
