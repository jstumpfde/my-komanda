-- Измерение АУДИТОРИИ для уровней комиссии.
-- Уровни теперь раздельны: 'partner' (для integrators.kind in 'partner'|'sub_partner')
-- и 'referral' (для integrators.kind = 'referral').
-- Аддитивно: существующие 5 строк по дефолту станут 'partner' — то что нужно.
ALTER TABLE integrator_levels ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'partner';
