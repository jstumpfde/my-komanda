/**
 * Рантайм воронки v2 — авто-гейт «прохода по баллу» (Фаза 1в).
 *
 * КРИТИЧНО: по умолчанию НИЧЕГО НЕ МЕНЯЕТСЯ.
 *   - Гейт применяется ТОЛЬКО если stage.rule.scoreGate?.autoEnabled === true.
 *   - У всех существующих/легаси стадий scoreGate отсутствует → гейт не срабатывает,
 *     кандидат уходит на РУЧНОЙ разбор (как и было). Поведение действующих
 *     вакансий не трогается.
 *
 * Алгоритм evaluateScoreGate(stage, candidate):
 *   1. autoEnabled !== true → вернуть null (гейт выключен, ручной разбор).
 *   2. Взять балл по scoreType:
 *        resume   → candidate.resumeScore
 *        anketa   → candidate.demoAnswersScore
 *        block2   → getBlock2Score(candidate) (из demoBlockScores)
 *        test     → candidate.testScore
 *        portrait → candidate.aiScoreV2
 *   3. Балл null (ещё не посчитан) → вернуть null (не гейтим, ждём подсчёта).
 *   4. Балл ≥ threshold → { pass: true } (двигать дальше).
 *   5. Балл < threshold → { pass: false, failAction }:
 *        preliminary_reject → перевести кандидата в stage='preliminary_reject'
 *        reject             → обычный отложенный отказ (scheduleV2Rejection)
 *        reserve            → в резерв (candidates.stage='talent_pool')
 *        manual             → ничего (оставить на ручной разбор)
 *
 * Чистое решение (без БД) — decideScoreGate — тестируется юнит-тестом.
 * Применение эффекта (perform*) — отдельно, с идемпотентностью и логами.
 */

import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates } from "@/lib/db/schema"
import type { ScoreGate, ScoreGateType, FunnelV2Stage } from "@/lib/funnel-v2/types"
import type { CandidateForExecutor } from "@/lib/funnel-v2/runtime-executor"
import { scheduleV2Rejection } from "@/lib/funnel-v2/advance-stage"

/** Минимальный срез баллов кандидата, нужный гейту. */
export interface CandidateScores {
  resumeScore?: number | null
  demoAnswersScore?: number | null
  aiScoreV2?: number | null
  testScore?: number | null
  /** Все баллы демо-блоков: { [demoId]: { title, score } }. */
  demoBlockScores?: Record<string, { title?: string; score?: number | null }> | null
}

/** Результат оценки гейта. null = гейт не применяется (ручной разбор / ждём балл). */
export type ScoreGateDecision =
  | { pass: true }
  | { pass: false; failAction: ScoreGate["failAction"] }
  | null

/**
 * Балл «block2» — второй демо-блок кандидата.
 *
 * Нет отдельной колонки — читаем из demoBlockScores ({ [demoId]: { score } }).
 * «block2» = блок с индексом 1 (второй по порядку записи) среди demo_block_scores.
 * Если блоков < 2 или балл отсутствует — возвращаем null (по нему не гейтим).
 */
export function getBlock2Score(cand: CandidateScores): number | null {
  const map = cand.demoBlockScores
  if (!map || typeof map !== "object") return null
  const entries = Object.values(map)
  const second = entries[1]
  if (!second || typeof second.score !== "number" || !isFinite(second.score)) return null
  return second.score
}

/** Извлечь балл нужного типа. null = ещё не посчитан (гейт ждёт). */
export function scoreForType(scoreType: ScoreGateType, cand: CandidateScores): number | null {
  switch (scoreType) {
    case "resume":   return numOrNull(cand.resumeScore)
    case "anketa":   return numOrNull(cand.demoAnswersScore)
    case "block2":   return getBlock2Score(cand)
    case "test":     return numOrNull(cand.testScore)
    case "portrait": return numOrNull(cand.aiScoreV2)
    default:         return null
  }
}

function numOrNull(v: number | null | undefined): number | null {
  return typeof v === "number" && isFinite(v) ? v : null
}

/**
 * ЧИСТОЕ решение гейта (без БД). Возвращает:
 *   - null    → гейт не применяется (autoEnabled!=true ИЛИ балл ещё не посчитан).
 *   - pass:true  → балл ≥ порога (двигать дальше).
 *   - pass:false → балл < порога (применить failAction).
 */
export function decideScoreGate(stage: FunnelV2Stage, cand: CandidateScores): ScoreGateDecision {
  const gate = stage.rule?.scoreGate
  // Рубильник: гейт срабатывает ТОЛЬКО при autoEnabled===true.
  if (!gate || gate.autoEnabled !== true) return null

  const score = scoreForType(gate.scoreType, cand)
  // Балл ещё не посчитан → не гейтим, ждём (следующий тик/пересчёт).
  if (score === null) return null

  if (score >= gate.threshold) return { pass: true }
  return { pass: false, failAction: gate.failAction }
}

/**
 * ОЦЕНИТЬ и ПРИМЕНИТЬ гейт по баллу для кандидата (с эффектами в БД).
 *
 * Гейт применяется ТОЛЬКО при scoreGate.autoEnabled===true (иначе вернёт null,
 * ничего не делает — ручной разбор).
 *
 * @returns
 *   null              — гейт не применён (выключен ИЛИ балл ещё не посчитан).
 *   { pass:true }     — прошёл порог; caller продолжает обычный поток (advance).
 *   { pass:false, failAction, applied } — не прошёл; эффект применён по failAction.
 */
export async function evaluateScoreGate(
  stage: FunnelV2Stage,
  candidate: CandidateForExecutor & CandidateScores,
): Promise<
  | null
  | { pass: true }
  | { pass: false; failAction: ScoreGate["failAction"]; applied: string }
> {
  const decision = decideScoreGate(stage, candidate)
  if (decision === null) return null
  if (decision.pass) {
    console.log("[funnel-v2/score-gate]", JSON.stringify({
      tag:         "funnel-v2/score-gate/pass",
      candidateId: candidate.id,
      stageId:     stage.id,
      scoreType:   stage.rule.scoreGate?.scoreType,
      threshold:   stage.rule.scoreGate?.threshold,
    }))
    return { pass: true }
  }

  const gate = stage.rule.scoreGate!  // decideScoreGate вернул non-null → gate есть
  const applied = await applyFailAction(stage, candidate, gate)

  console.log("[funnel-v2/score-gate]", JSON.stringify({
    tag:         "funnel-v2/score-gate/fail",
    candidateId: candidate.id,
    stageId:     stage.id,
    scoreType:   gate.scoreType,
    threshold:   gate.threshold,
    failAction:  gate.failAction,
    applied,
  }))

  return { pass: false, failAction: gate.failAction, applied }
}

/**
 * Применить действие для не прошедшего порог кандидата. Идемпотентно.
 * @returns строка-диагностика: что реально сделали.
 */
async function applyFailAction(
  stage: FunnelV2Stage,
  candidate: CandidateForExecutor,
  gate: ScoreGate,
): Promise<string> {
  switch (gate.failAction) {
    // ── Предварительный отказ ──────────────────────────────────────────────
    // Перевести кандидата в stage='preliminary_reject' (не финальный отказ —
    // HR может пересмотреть). Идемпотентно: если уже там / уже rejected — skip.
    case "preliminary_reject": {
      const [cur] = await db
        .select({ stage: candidates.stage })
        .from(candidates)
        .where(eq(candidates.id, candidate.id))
        .limit(1)
      if (!cur) return "candidate_not_found"
      if (cur.stage === "preliminary_reject") return "already_preliminary_reject"
      if (cur.stage === "rejected") return "already_rejected"
      await db.update(candidates)
        .set({ stage: "preliminary_reject", updatedAt: new Date() })
        .where(eq(candidates.id, candidate.id))
      return "set_preliminary_reject"
    }

    // ── Обычный отложенный отказ ───────────────────────────────────────────
    // Переиспользуем scheduleV2Rejection (идемпотентен внутри: пропускает
    // уже rejected / с существующим pending-отказом).
    case "reject": {
      const rejectText = (stage.rule.rejectText ?? "").trim() || undefined
      await scheduleV2Rejection(candidate, stage.id, stage.rule.rejectDelayMinutes, rejectText)
      return "scheduled_rejection"
    }

    // ── В резерв (talent pool) ─────────────────────────────────────────────
    // Кандидат-из-вакансии → резерв = candidates.stage='talent_pool' (тот же
    // путь, что кнопка «В резерв» в карточке / bulk-действие). talent_pool_entries
    // — для внешних/CSV-записей, funnel-кандидатов туда НЕ дублируем.
    // Идемпотентно: если уже talent_pool / rejected — skip.
    case "reserve": {
      const [cur] = await db
        .select({ stage: candidates.stage })
        .from(candidates)
        .where(eq(candidates.id, candidate.id))
        .limit(1)
      if (!cur) return "candidate_not_found"
      if (cur.stage === "talent_pool") return "already_in_reserve"
      if (cur.stage === "rejected") return "already_rejected"
      await db.update(candidates)
        .set({ stage: "talent_pool", updatedAt: new Date() })
        .where(eq(candidates.id, candidate.id))
      return "moved_to_reserve"
    }

    // ── Ручной разбор ──────────────────────────────────────────────────────
    // Ничего не делаем — оставляем кандидата HR-у.
    case "manual":
    default:
      return "left_for_manual"
  }
}
