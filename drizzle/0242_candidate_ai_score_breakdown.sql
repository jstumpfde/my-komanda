-- Осевой скоринг резюме (Портрет, редизайн 02.07.2026).
-- Разбор осевой оценки резюме (AxisScoreResult целиком: оси score→points+evidence,
-- штрафы, verdict, summary) — для блока «почему» на карточке кандидата.
-- Пишется в lib/hh/process-queue.ts и rescore, когда spec.scoringMode='axes'.
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS ai_score_breakdown jsonb;
