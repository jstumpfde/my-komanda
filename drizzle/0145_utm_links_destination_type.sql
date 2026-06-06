-- Источники кандидатов: куда ведёт короткая ссылка /v/{slug}.
--   'vacancy' (default) — редирект на /vacancy/{slug} (поведение до миграции;
--                          существующие записи получают этот дефолт, обратная
--                          совместимость сохраняется).
--   'demo'              — редирект на /api/public/source/{linkId}/visit, который
--                          создаёт кандидата под link.vacancy_id и шлёт сразу
--                          на /demo/{newShortId}. UI выбирает в модалке
--                          "Создать ссылку" (components/vacancies/utm-links-section.tsx).
-- Допустимые значения валидируются в коде (Zod-стиль enum в POST
-- /api/modules/hr/vacancies/[id]/utm-links). CHECK на уровне БД не ставим —
-- по конвенции репо (см. 0140, 0141).
ALTER TABLE vacancy_utm_links
  ADD COLUMN IF NOT EXISTS destination_type text NOT NULL DEFAULT 'vacancy';
