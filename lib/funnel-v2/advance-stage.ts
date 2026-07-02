/**
 * Рантайм воронки v2 — продвижение кандидата между стадиями.
 *
 * Фаза 0:
 * - nextStageId — РЕАЛЬНО реализована (чистая логика, без БД).
 * - advanceToNextStage — заглушка.
 *
 * Фаза 1:
 * - advanceToNextStage — реализована: запись в БД + executeStageEntry + отмена дожима предыдущей стадии.
 * - scheduleV2Rejection — заглушка (Фаза 2).
 */

import { eq, and, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, followUpMessages, followUpCampaigns } from "@/lib/db/schema"
import type { FunnelV2Stage } from "@/lib/funnel-v2/types"
import type { CandidateForExecutor, VacancyForExecutor } from "@/lib/funnel-v2/runtime-executor"
import type { FunnelV2State } from "@/lib/db/schema"

// ────────────────────────────────────────────────────────────────────────────────
// Чистая логика (без БД, без IO — легко тестируется)
// ────────────────────────────────────────────────────────────────────────────────

/** Стадия включена? enabled===false = выключена, иначе включена (компат). */
function stageEnabled(s: FunnelV2Stage): boolean {
  return s.enabled !== false
}

/** Первая ВКЛЮЧЁННАЯ стадия начиная с индекса from (включительно) или null. */
function firstEnabledFrom(stages: FunnelV2Stage[], from: number): string | null {
  for (let i = Math.max(0, from); i < stages.length; i++) {
    if (stageEnabled(stages[i])) return stages[i].id
  }
  return null
}

/**
 * Вычислить id следующей стадии.
 *
 * Правила (в приоритете):
 * 1. Если `advanceTo` задан и это не строка `'next'` — вернуть его (ветвление).
 * 2. Иначе найти стадию с `id === currentId` и вернуть id следующей по порядку.
 * 3. Если currentId — последняя стадия (или не найдена) — вернуть null.
 *
 * Выключенные стадии (enabled===false) пропускаются: кандидат проскакивает на
 * следующую включённую (в т.ч. если цель явного ветвления выключена).
 * Отсутствие поля enabled = стадия включена (прежнее поведение).
 *
 * @param stages    Массив стадий воронки (из FunnelV2Config.stages).
 * @param currentId id текущей стадии.
 * @param advanceTo Куда переводим: `'next'` | конкретный id стадии | undefined.
 * @returns id следующей стадии или null (конец воронки).
 */
export function nextStageId(
  stages: FunnelV2Stage[],
  currentId: string,
  advanceTo?: string,
): string | null {
  // Правило 1: явное ветвление (не 'next')
  if (advanceTo && advanceTo !== "next") {
    // Убеждаемся, что целевая стадия существует; если нет — деградируем к порядку
    const targetIdx = stages.findIndex((s) => s.id === advanceTo)
    // Цель выключена → идём к следующей включённой после неё.
    if (targetIdx !== -1) return firstEnabledFrom(stages, targetIdx)
  }

  // Правило 2-3: следующая ВКЛЮЧЁННАЯ по порядку
  const currentIdx = stages.findIndex((s) => s.id === currentId)
  if (currentIdx === -1) return null          // текущая стадия не найдена
  return firstEnabledFrom(stages, currentIdx + 1) // null = конец воронки
}

/** id первой включённой стадии воронки (вход кандидата) или null. */
export function firstEnabledStageId(stages: FunnelV2Stage[]): string | null {
  return firstEnabledFrom(stages, 0)
}

// ────────────────────────────────────────────────────────────────────────────────
// Параметры и реализация (взаимодействует с БД — Фаза 1)
// ────────────────────────────────────────────────────────────────────────────────

/** Параметры продвижения кандидата. */
export interface AdvanceOptions {
  /**
   * Куда переводим: `'next'` | конкретный id стадии | undefined.
   * Если не указан — используем stage.rule.advanceTo из текущей стадии.
   */
  advanceTo?: string
  /** Балл за прохождение текущей стадии (сохраняется в FunnelV2State). */
  scoreForStage?: number
}

/**
 * Отменить активные дожим-касания для предыдущей стадии.
 * Отменяются все pending-записи с branch=`funnelv2:<prevStageId>`.
 */
async function cancelPrevDozhim(candidateId: string, prevStageId: string): Promise<void> {
  try {
    const branch = `funnelv2:${prevStageId}`
    // Находим все кампании кандидата (обычно одна)
    const [candidateRow] = await db
      .select({ vacancyId: candidates.vacancyId })
      .from(candidates)
      .where(eq(candidates.id, candidateId))
      .limit(1)
    if (!candidateRow) return

    const campaigns = await db
      .select({ id: followUpCampaigns.id })
      .from(followUpCampaigns)
      .where(eq(followUpCampaigns.vacancyId, candidateRow.vacancyId))

    if (campaigns.length === 0) return
    const campaignIds = campaigns.map(c => c.id)

    await db.update(followUpMessages)
      .set({ status: "cancelled" })
      .where(and(
        eq(followUpMessages.candidateId, candidateId),
        inArray(followUpMessages.campaignId, campaignIds),
        eq(followUpMessages.status, "pending"),
        eq(followUpMessages.branch, branch),
      ))
  } catch (err) {
    console.warn("[funnel-v2/advance] cancelPrevDozhim error:", err instanceof Error ? err.message : err)
  }
}

/**
 * Маппинг action стадии → legacy-поле candidates.stage.
 * Используется для синхронизации легаси-UI/фильтров/отчётов при v2-advance.
 * Решение Юрия: синкать legacy-stage при advance (В4).
 */
function mapActionToLegacyStage(action: string): string | null {
  const MAP: Record<string, string> = {
    "prequalification": "primary_contact",
    "demo":             "demo_opened",
    "test":             "test_task_sent",
    "task":             "test_task_sent",
    "interview":        "interview",
    "offer":            "final_decision",
    "hired":            "hired",
    "security_check":   "interview",
    "reference_check":  "interview",
    "message":          "primary_contact",
  }
  return MAP[action] ?? null
}

/**
 * Продвинуть кандидата на следующую стадию воронки v2.
 *
 * Действия:
 * 1. Вычислить nextId через nextStageId() с учётом rule.advanceTo текущей стадии.
 * 2. Отменить активные дожим-касания предыдущей стадии (branch=`funnelv2:<prevId>`).
 * 3. Записать новый FunnelV2State в candidates.funnel_v2_state_json.
 * 4. (Опц.) Синхронизировать candidates.stage через маппинг action→legacy-stage (В4).
 * 5. Если nextId=null — пометить завершение воронки (completedAt в state).
 * 6. Вызвать executeStageEntry(candidate, vacancy, nextStage).
 *
 * @param candidate Кандидат.
 * @param vacancy   Вакансия.
 * @param options   Параметры продвижения.
 */
export async function advanceToNextStage(
  candidate: CandidateForExecutor,
  vacancy: VacancyForExecutor,
  options: AdvanceOptions = {},
): Promise<void> {
  const stages = vacancy.funnelV2.stages
  const currentState = candidate.funnelV2StateJson

  // Определяем текущую стадию для получения rule.advanceTo
  const currentStage = currentState?.stageId
    ? stages.find(s => s.id === currentState.stageId)
    : null

  // Вычисляем куда идём: явный options.advanceTo → rule.advanceTo → 'next'
  const targetAdvanceTo = options.advanceTo ?? currentStage?.rule.advanceTo ?? "next"
  const prevStageId = currentState?.stageId ?? null

  // Вычисляем id следующей стадии (выключенные пропускаются)
  const nextId = prevStageId
    ? nextStageId(stages, prevStageId, targetAdvanceTo)
    : firstEnabledStageId(stages)

  const nowIso = new Date().toISOString()

  // Шаг 1: отменить pending-дожим предыдущей стадии
  if (prevStageId) {
    await cancelPrevDozhim(candidate.id, prevStageId)
  }

  // Шаг 2: завершение воронки (nextId=null)
  if (nextId === null) {
    // Помечаем последнюю стадию как завершённую
    const completedState: FunnelV2State = {
      stageId:                 prevStageId ?? "",
      enteredAt:               currentState?.enteredAt ?? nowIso,
      completedAt:             nowIso,
      scoreForStage:           options.scoreForStage ?? currentState?.scoreForStage ?? null,
      pendingRejectionStageId: null,
      touchesSent:             currentState?.touchesSent ?? 0,
      dozhimStartedAt:         currentState?.dozhimStartedAt ?? null,
    }
    await db.update(candidates)
      .set({
        funnelV2StateJson: completedState,
        stage:             "hired",   // конец воронки = нанят (легаси)
        updatedAt:         new Date(),
      })
      .where(eq(candidates.id, candidate.id))

    console.log("[funnel-v2/advance]", JSON.stringify({
      tag:         "funnel-v2/advance-completed",
      candidateId: candidate.id,
      prevStageId,
      reason:      "no_next_stage",
    }))
    return
  }

  // Шаг 3: находим следующую стадию
  const nextStage = stages.find(s => s.id === nextId)
  if (!nextStage) {
    console.error("[funnel-v2/advance] nextStage не найдена в конфиге", {
      candidateId: candidate.id,
      nextId,
    })
    return
  }

  // Шаг 4: записываем новый FunnelV2State
  const newState: FunnelV2State = {
    stageId:                 nextId,
    enteredAt:               nowIso,
    completedAt:             null,
    scoreForStage:           null,
    pendingRejectionStageId: null,
    touchesSent:             0,
    dozhimStartedAt:         null,
  }

  // Синк legacy-stage (В4): маппинг action следующей стадии → legacy stage
  const legacyStage = mapActionToLegacyStage(nextStage.action)
  const updateSet: Record<string, unknown> = {
    funnelV2StateJson: newState,
    updatedAt:         new Date(),
  }
  if (legacyStage) {
    updateSet.stage = legacyStage
  }

  await db.update(candidates)
    .set(updateSet)
    .where(eq(candidates.id, candidate.id))

  console.log("[funnel-v2/advance]", JSON.stringify({
    tag:          "funnel-v2/advanced",
    candidateId:  candidate.id,
    prevStageId,
    nextStageId:  nextId,
    nextAction:   nextStage.action,
    legacyStage,
  }))

  // Шаг 5: обновить объект кандидата для передачи в executeStageEntry
  const updatedCandidate: CandidateForExecutor = {
    ...candidate,
    funnelV2StateJson: newState,
  }

  // Шаг 6: вызвать executeStageEntry для новой стадии
  const { executeStageEntry } = await import("@/lib/funnel-v2/runtime-executor")
  await executeStageEntry(updatedCandidate, vacancy, nextStage)
}

/**
 * Запланировать отложенный отказ по v2-воронке.
 *
 * Записывает в candidates:
 *   - pendingRejectionAt = now + delayMinutes (legacy-поле, которое читает cron)
 *   - funnelV2StateJson.pendingRejectionStageId = stageId (маркер v2)
 *   - funnelV2StateJson.pendingRejectionText = отрендеренный текст отказа
 *
 * cron/pending-rejections v2-ветка читает pendingRejectionStageId и использует
 * pendingRejectionText вместо generic-текста вакансии.
 *
 * Идемпотентно: если кандидат уже rejected или уже есть pending-отказ v2 — пропускаем.
 *
 * @param candidate   Кандидат с актуальным funnelV2StateJson.
 * @param stageId     id стадии, на которой запланирован отказ (для диагностики/стоп-триггера).
 * @param delayMinutes Задержка отказа в минутах (дефолт из rule.rejectDelayMinutes).
 * @param rejectText  Уже отрендеренный текст отказа (опционально).
 */
export async function scheduleV2Rejection(
  candidate: CandidateForExecutor,
  stageId: string,
  delayMinutes: number,
  rejectText?: string,
): Promise<void> {
  // Не планируем, если кандидат уже отклонён
  const [current] = await db
    .select({ stage: candidates.stage, pendingRejectionAt: candidates.pendingRejectionAt })
    .from(candidates)
    .where(eq(candidates.id, candidate.id))
    .limit(1)

  if (!current) {
    console.warn("[funnel-v2/advance] scheduleV2Rejection — кандидат не найден", { candidateId: candidate.id })
    return
  }
  if (current.stage === "rejected") {
    console.warn("[funnel-v2/advance] scheduleV2Rejection — кандидат уже rejected, пропускаем", { candidateId: candidate.id })
    return
  }
  if (current.pendingRejectionAt) {
    // Уже есть legacy-pending (мог быть запланирован ранее — не сдвигаем)
    console.warn("[funnel-v2/advance] scheduleV2Rejection — уже есть pending-отказ, пропускаем", {
      candidateId: candidate.id,
      existingAt:  current.pendingRejectionAt.toISOString(),
    })
    return
  }

  const now = new Date()
  const pendingAt = new Date(now.getTime() + Math.max(0, delayMinutes) * 60_000)

  // Собираем обновлённый FunnelV2State с маркером v2-отказа
  const prevState = candidate.funnelV2StateJson
  const newState: import("@/lib/db/schema").FunnelV2State = {
    stageId:                 prevState?.stageId                 ?? stageId,
    enteredAt:               prevState?.enteredAt               ?? now.toISOString(),
    completedAt:             prevState?.completedAt             ?? null,
    scoreForStage:           prevState?.scoreForStage           ?? null,
    pendingRejectionStageId: stageId,
    pendingRejectionText:    rejectText ?? null,
    touchesSent:             prevState?.touchesSent             ?? 0,
    dozhimStartedAt:         prevState?.dozhimStartedAt         ?? null,
  }

  await db.update(candidates)
    .set({
      pendingRejectionAt:     pendingAt,
      pendingRejectionReason: `funnel_v2:${stageId}`,
      pendingRejectionSetAt:  now,
      funnelV2StateJson:      newState,
      updatedAt:              now,
    })
    .where(eq(candidates.id, candidate.id))

  console.log("[funnel-v2/advance]", JSON.stringify({
    tag:          "funnel-v2/rejection-scheduled",
    candidateId:  candidate.id,
    stageId,
    pendingAt:    pendingAt.toISOString(),
    delayMinutes,
    hasRejectText: !!rejectText,
  }))
}
