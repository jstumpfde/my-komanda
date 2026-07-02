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
import type { ScoreGate, ScoreGateType, ScoreGateMiddleAction, FunnelV2Stage } from "@/lib/funnel-v2/types"
import type { CandidateForExecutor, VacancyForExecutor } from "@/lib/funnel-v2/runtime-executor"
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

/** Зона трёхзонного гейта (только при заданном thresholdLower). */
export type ScoreGateZone = "red" | "middle"

/** Результат оценки гейта. null = гейт не применяется (ручной разбор / ждём балл).
 *  zone/middleAction заполняются ТОЛЬКО в трёхзонном режиме (thresholdLower задан);
 *  в двухзонном режиме форма решения прежняя (обратная совместимость). */
export type ScoreGateDecision =
  | { pass: true }
  | { pass: false; failAction: ScoreGate["failAction"]; zone?: ScoreGateZone; middleAction?: ScoreGateMiddleAction }
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

  // ── Двухзонный режим (thresholdLower не задан) — прежнее поведение ────────
  const lowerRaw = gate.thresholdLower
  if (typeof lowerRaw !== "number" || !isFinite(lowerRaw)) {
    return { pass: false, failAction: gate.failAction }
  }

  // ── Трёхзонный режим (Воронка 3) ──────────────────────────────────────────
  // score < thresholdLower → красная зона: отказ при autoRejectRed, иначе
  // ручной разбор с пометкой. Между порогами → жёлтая зона: middleAction
  // (дефолт manual_review). thresholdLower > threshold защитно клампится.
  const lower = Math.min(lowerRaw, gate.threshold)
  if (score < lower) {
    return gate.autoRejectRed === true
      ? { pass: false, failAction: "reject", zone: "red" }
      : { pass: false, failAction: "manual", zone: "red" }
  }
  const middleAction: ScoreGateMiddleAction = gate.middleAction ?? "manual_review"
  return { pass: false, failAction: "manual", zone: "middle", middleAction }
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
  /** Вакансия (опционально): нужна ТОЛЬКО для middleAction='prequalification'
   *  (перевод в стадию предквалификации). Без неё жёлтая зона = ручной разбор. */
  vacancy?: VacancyForExecutor,
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
  const applied = await applyFailDecision(stage, candidate, gate, decision, vacancy)

  console.log("[funnel-v2/score-gate]", JSON.stringify({
    tag:         "funnel-v2/score-gate/fail",
    candidateId: candidate.id,
    stageId:     stage.id,
    scoreType:   gate.scoreType,
    threshold:   gate.threshold,
    thresholdLower: gate.thresholdLower,
    zone:        decision.zone,
    middleAction: decision.middleAction,
    failAction:  decision.failAction,
    applied,
  }))

  return { pass: false, failAction: decision.failAction, applied }
}

/**
 * Применить решение «не прошёл» с учётом зон трёхзонного гейта. Идемпотентно.
 *
 * Трёхзонные ветки (только при decision.zone):
 *   - жёлтая + middleAction='prequalification' → перевод в стадию
 *     предквалификации (первая включённая prequalification-стадия конфига);
 *     нет такой стадии / нет vacancy → ручной разбор.
 *   - красная без авто-отказа → ручной разбор С ПОМЕТКОЙ
 *     (candidates.auto_processing_stopped_reason = funnel_v2_red_zone:<stageId>).
 * Остальное — через applyFailAction по decision.failAction (как раньше).
 */
async function applyFailDecision(
  stage: FunnelV2Stage,
  candidate: CandidateForExecutor,
  gate: ScoreGate,
  decision: { pass: false; failAction: ScoreGate["failAction"]; zone?: ScoreGateZone; middleAction?: ScoreGateMiddleAction },
  vacancy?: VacancyForExecutor,
): Promise<string> {
  // Жёлтая зона → предквалификация (перевод в prequalification-стадию воронки).
  if (decision.zone === "middle" && decision.middleAction === "prequalification") {
    // Анти-цикл: с ЭТОЙ стадии кандидата уже отправляли на предквалификацию
    // (маркер в funnelV2StateJson переживает продвижения) → второй раз не шлём,
    // ручной разбор.
    if (candidate.funnelV2StateJson?.middlePrequalFromStageId === stage.id) {
      return "left_for_manual_prequal_repeat"
    }
    const stages = vacancy?.funnelV2?.stages ?? []
    const curIdx = stages.findIndex(s => s.id === stage.id)
    // ТОЛЬКО ВПЕРЁД от текущей: первая включённая prequalification-стадия ПОСЛЕ
    // текущей. Назад не ищем (иначе цикл по воронке). Нет — ручной разбор.
    const isPrequal = (s: FunnelV2Stage) => s.action === "prequalification" && s.enabled !== false && s.id !== stage.id
    const target = curIdx === -1 ? undefined : stages.slice(curIdx + 1).find(isPrequal)
    if (target && vacancy) {
      const { advanceToNextStage } = await import("@/lib/funnel-v2/advance-stage")
      await advanceToNextStage(candidate, vacancy, { advanceTo: target.id })
      // Ставим маркер анти-цикла в СВЕЖЕЕ состояние (advance переписал stateJson).
      try {
        const [fresh] = await db
          .select({ funnelV2StateJson: candidates.funnelV2StateJson })
          .from(candidates)
          .where(eq(candidates.id, candidate.id))
          .limit(1)
        if (fresh?.funnelV2StateJson) {
          await db.update(candidates)
            .set({ funnelV2StateJson: { ...fresh.funnelV2StateJson, middlePrequalFromStageId: stage.id } })
            .where(eq(candidates.id, candidate.id))
        }
      } catch (err) {
        console.warn("[funnel-v2/score-gate] не удалось поставить анти-цикл маркер:", err instanceof Error ? err.message : err)
      }
      return `advanced_to_prequalification:${target.id}`
    }
    // Нет стадии предквалификации впереди → безопасная деградация: ручной разбор.
    return "left_for_manual_no_prequal_stage"
  }

  // Красная зона без авто-отказа → ручной разбор с пометкой (видна в отчёте).
  if (decision.zone === "red" && decision.failAction === "manual") {
    const [cur] = await db
      .select({ stage: candidates.stage, reason: candidates.autoProcessingStoppedReason })
      .from(candidates)
      .where(eq(candidates.id, candidate.id))
      .limit(1)
    if (!cur) return "candidate_not_found"
    // Guard на терминальные стадии (как в applyFailAction).
    if (cur.stage === "rejected") return "already_rejected"
    if (cur.stage === "hired") return "already_hired"
    if (cur.stage === "talent_pool") return "already_in_reserve"
    if (cur.stage === "preliminary_reject") return "already_preliminary_reject"
    // Не перезаписываем уже заполненную причину (могла поставить другая система).
    if ((cur.reason ?? "").trim().length > 0) return "already_marked_reason_kept"
    await db.update(candidates)
      .set({ autoProcessingStoppedReason: `funnel_v2_red_zone:${stage.id}`, updatedAt: new Date() })
      .where(eq(candidates.id, candidate.id))
    return "marked_red_zone_manual"
  }

  return applyFailAction(stage, candidate, { ...gate, failAction: decision.failAction })
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
    // Текст: stage.rejectText (Воронка 3) → rule.rejectText → undefined
    // (дальше действующий стандартный текст вакансии, cron pending-rejections).
    case "reject": {
      const rejectText = (stage.rejectText ?? "").trim() || (stage.rule.rejectText ?? "").trim() || undefined
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
