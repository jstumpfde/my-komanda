-- Повторные отклики (Юрий 03.07): кандидат, откликнувшийся снова, «терялся»
-- в списке под датой первого отклика. Храним дату ПОСЛЕДНЕГО отклика отдельно:
-- колонка «Дата» и сортировка используют её (fallback created_at), первый
-- отклик остаётся в created_at и показывается в ховере.
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS last_responded_at timestamp with time zone;

-- Backfill: только реально повторные (у кого >1 hh-отклика) и только если
-- последний отклик новее создания кандидата.
UPDATE candidates c
SET last_responded_at = r.mx
FROM (
  SELECT local_candidate_id, max(created_at) AS mx
  FROM hh_responses
  WHERE local_candidate_id IS NOT NULL
  GROUP BY local_candidate_id
  HAVING count(*) > 1
) r
WHERE r.local_candidate_id = c.id
  AND c.last_responded_at IS NULL
  AND r.mx > c.created_at + interval '6 hours';
