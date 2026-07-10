-- Аудит 10.07: дата события найма — для честных метрик отчёта («Нанято за
-- период» по дате найма, а не по дате отклика). Backfill: для уже нанятых
-- берём последнюю запись stage_history с to='hired' (если есть), иначе
-- updated_at как лучшее приближение.
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS hired_at timestamptz;

UPDATE candidates c SET hired_at = COALESCE(
  (
    SELECT max((elem->>'at')::timestamptz)
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(c.stage_history) = 'array' THEN c.stage_history ELSE '[]'::jsonb END
    ) elem
    WHERE elem->>'to' = 'hired' AND (elem->>'at') IS NOT NULL
  ),
  c.updated_at
)
WHERE c.stage = 'hired' AND c.hired_at IS NULL;
