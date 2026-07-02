/**
 * Рантайм воронки v2 — обработчик завершения стадии.
 *
 * Фаза 2: реализованы onAnketaCompleted и onTestSubmitted.
 *
 * Алгоритм для каждой точки завершения:
 *   1. Загрузить кандидата и вакансию из БД.
 *   2. Убедиться, что флаг funnelV2RuntimeEnabled=true и есть funnelV2StateJson.
 *   3. Найти текущую стадию в конфиге воронки.
 *   4. Вычислить балл через calcStageScore (если есть контентный блок с вопросами).
 *   5. Записать scoreForStage и completedAt в funnelV2StateJson.
 *   6. Применить StageRule:
 *      - если rule.autoReject && scorePercent < threshold → scheduleV2Rejection
 *      - иначе если rule.autoAdvance → advanceToNextStage
 *      - иначе → пометить completedAt (ждёт HR)
 */

import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies, demos } from "@/lib/db/schema"
import type { FunnelV2State } from "@/lib/db/schema"
import { normalizeFunnelV2 } from "@/lib/funnel-v2/types"
import type { FunnelV2Stage } from "@/lib/funnel-v2/types"
import { calcStageScore, calcStageScoreWithAI } from "@/lib/funnel-v2/calc-stage-score"
import { scheduleV2Rejection } from "@/lib/funnel-v2/advance-stage"
import { advanceToNextStage } from "@/lib/funnel-v2/advance-stage"
import { evaluateScoreGate, type CandidateScores } from "@/lib/funnel-v2/score-gate"
import type { CandidateForExecutor, VacancyForExecutor } from "@/lib/funnel-v2/runtime-executor"
import type { StructuredAnswer } from "@/lib/score-test-objective"
import { renderTemplate } from "@/lib/template-renderer"
import { getCandidateFirstName } from "@/lib/messaging/candidate-name"

// ────────────────────────────────────────────────────────────────────────────────
// Вспомогательные загрузчики
// ────────────────────────────────────────────────────────────────────────────────

/** Загрузить минимальный срез кандидата + вакансии для обработчика. */
async function loadForCompletion(candidateId: string): Promise<{
  candidate: CandidateForExecutor
  vacancy: VacancyForExecutor
  scores: CandidateScores
} | null> {
  const [row] = await db
    .select({
      // Поля кандидата
      cId:               candidates.id,
      cToken:            candidates.token,
      cName:             candidates.name,
      cEmail:            candidates.email,
      cPhone:            candidates.phone,
      cVacancyId:        candidates.vacancyId,
      cFunnelV2State:    candidates.funnelV2StateJson,
      // Баллы для авто-гейта по баллу (score-gate, Фаза 1в)
      cResumeScore:      candidates.resumeScore,
      cDemoAnswersScore: candidates.demoAnswersScore,
      cAiScoreV2:        candidates.aiScoreV2,
      cDemoBlockScores:  candidates.demoBlockScores,
      // Поля вакансии
      vId:               vacancies.id,
      vTitle:            vacancies.title,
      vCompanyId:        vacancies.companyId,
      vDescriptionJson:  vacancies.descriptionJson,
      vFunnelV2Runtime:  vacancies.funnelV2RuntimeEnabled,
      // Расписание для adjustToWorkingWindow
      vSchedEnabled:     vacancies.scheduleEnabled,
      vSchedStart:       vacancies.scheduleStart,
      vSchedEnd:         vacancies.scheduleEnd,
      vSchedTz:          vacancies.scheduleTimezone,
      vSchedDays:        vacancies.scheduleWorkingDays,
      vSchedHolidays:    vacancies.scheduleExcludedHolidayIds,
    })
    .from(candidates)
    .innerJoin(vacancies, eq(vacancies.id, candidates.vacancyId))
    .where(eq(candidates.id, candidateId))
    .limit(1)

  if (!row) return null

  // Распаковываем funnelV2 из descriptionJson
  const descJson = row.vDescriptionJson as { funnelV2?: unknown } | null
  const funnelV2 = normalizeFunnelV2(descJson?.funnelV2)

  const candidate: CandidateForExecutor = {
    id:                candidateId,
    token:             row.cToken ?? "",
    name:              row.cName ?? "",
    email:             row.cEmail,
    phone:             row.cPhone,
    vacancyId:         row.cVacancyId,
    funnelV2StateJson: (row.cFunnelV2State as FunnelV2State | null) ?? null,
  }

  const vacancy: VacancyForExecutor = {
    id:                       row.vId,
    title:                    row.vTitle,
    companyId:                row.vCompanyId ?? "",
    funnelV2:                 funnelV2,
    funnelV2RuntimeEnabled:   row.vFunnelV2Runtime ?? false,
    scheduleEnabled:          row.vSchedEnabled,
    scheduleStart:            row.vSchedStart,
    scheduleEnd:              row.vSchedEnd,
    scheduleTimezone:         row.vSchedTz,
    scheduleWorkingDays:      row.vSchedDays as number[] | null,
    scheduleExcludedHolidayIds: row.vSchedHolidays as string[] | null,
  }

  const scores: CandidateScores = {
    resumeScore:      row.cResumeScore ?? null,
    demoAnswersScore: row.cDemoAnswersScore ?? null,
    aiScoreV2:        row.cAiScoreV2 ?? null,
    demoBlockScores:  (row.cDemoBlockScores as CandidateScores["demoBlockScores"]) ?? null,
    // testScore — производный (нет колонки); гейт по test работает при пересчёте
    // из route теста. Здесь null → гейт по test не срабатывает (ждём балл).
    testScore:        null,
  }

  return { candidate, vacancy, scores }
}

/** Загрузить lessonsJson контентного блока текущей стадии (из таблицы demos). */
async function loadStageLessons(contentBlockId: string): Promise<unknown> {
  const [demoRow] = await db
    .select({ lessonsJson: demos.lessonsJson })
    .from(demos)
    .where(eq(demos.id, contentBlockId))
    .limit(1)
  return demoRow?.lessonsJson ?? []
}

// ────────────────────────────────────────────────────────────────────────────────
// Применение StageRule
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Применить правило стадии после её завершения:
 *   - Записать scoreForStage + completedAt в funnelV2StateJson.
 *   - Применить StageRule: autoReject / autoAdvance / пометить completedAt.
 */
async function applyStageRule(args: {
  candidate:        CandidateForExecutor
  vacancy:          VacancyForExecutor
  stage:            FunnelV2Stage
  scorePercent:     number
  totalScore:       number
  objectivePercent?: number | null  // % правильных ответов (объективные вопросы)
  aiPercent?:        number | null  // % AI-балла (AI-вопросы)
  scores?:          CandidateScores // баллы кандидата для авто-гейта по баллу (Фаза 1в)
}): Promise<void> {
  const { candidate, vacancy, stage, scorePercent, totalScore } = args
  const objectivePercent = args.objectivePercent ?? null
  const aiPercent        = args.aiPercent ?? null
  const now = new Date()
  const nowIso = now.toISOString()

  // Шаг 1: записать балл и отметить стадию завершённой (completedAt).
  const prevState = candidate.funnelV2StateJson
  const updatedState: FunnelV2State = {
    stageId:                 prevState?.stageId                 ?? stage.id,
    enteredAt:               prevState?.enteredAt               ?? nowIso,
    completedAt:             nowIso,
    scoreForStage:           totalScore,
    pendingRejectionStageId: prevState?.pendingRejectionStageId ?? null,
    pendingRejectionText:    prevState?.pendingRejectionText     ?? null,
    touchesSent:             prevState?.touchesSent             ?? 0,
    dozhimStartedAt:         prevState?.dozhimStartedAt         ?? null,
    holdReason:              prevState?.holdReason              ?? null,
    middlePrequalFromStageId: prevState?.middlePrequalFromStageId ?? null,
  }

  await db.update(candidates)
    .set({ funnelV2StateJson: updatedState, updatedAt: now })
    .where(eq(candidates.id, candidate.id))

  // Обновляем локальный объект для передачи в scheduleV2Rejection / advanceToNextStage
  const updatedCandidate: CandidateForExecutor = {
    ...candidate,
    funnelV2StateJson: updatedState,
  }

  // ── Шаг 1.5: АВТО-ГЕЙТ ПО БАЛЛУ (Фаза 1в) ────────────────────────────────
  // Срабатывает ТОЛЬКО если stage.rule.scoreGate.autoEnabled===true. Иначе
  // evaluateScoreGate вернёт null и мы идём по легаси-пути ниже (autoReject/
  // autoAdvance/ручной разбор) — поведение действующих вакансий не трогается.
  if (stage.rule.scoreGate?.autoEnabled === true) {
    const gateCandidate = { ...updatedCandidate, ...(args.scores ?? {}) }
    // vacancy нужна гейту для трёхзонного middleAction='prequalification'.
    const gate = await evaluateScoreGate(stage, gateCandidate, vacancy)
    if (gate !== null) {
      if (gate.pass) {
        // Прошёл порог по баллу → двигаем дальше (авто-приглашение).
        await advanceToNextStage(updatedCandidate, vacancy, { advanceTo: stage.rule.advanceTo, scoreForStage: totalScore })
      }
      // gate.pass===false → эффект (preliminary_reject/reject/reserve/manual)
      // уже применён внутри evaluateScoreGate. В любом исходе гейт — терминальный:
      // легаси-логику ниже НЕ выполняем (иначе двойное решение).
      return
    }
    // gate===null (балл ещё не посчитан) → падаем в легаси-путь ниже.
  }

  const rule = stage.rule
  const aiThreshold  = typeof rule.threshold    === "number" ? rule.threshold    : undefined
  const objThreshold = typeof rule.objThreshold === "number" ? rule.objThreshold : undefined

  // Два независимых порога (решение Юрия 01.07): AI-балл и правильные ответы.
  //  - AI-балл для гейта: реальный aiPercent, если AI-вопросы были; иначе итоговый
  //    scorePercent (backward-compat со старым единственным «Порогом балла»).
  //  - Правильные ответы: objectivePercent (объективные вопросы). Нет их — не гейтим.
  // Отказ, если не пройден ЛЮБОЙ заданный порог. Пустой порог = по нему не отбираем.
  const aiForGate = typeof aiPercent === "number" ? aiPercent : scorePercent
  const aiFail  = typeof aiThreshold  === "number" && aiForGate < aiThreshold
  const objFail = typeof objThreshold === "number" && typeof objectivePercent === "number" && objectivePercent < objThreshold

  // Шаг 2: autoReject — если не пройден любой из заданных порогов
  if (rule.autoReject && (aiFail || objFail)) {
    // Рендерим текст отказа ({{имя}} и пр.).
    // Приоритет: stage.rejectText (Воронка 3) → rule.rejectText → пусто
    // (дальше действующий стандартный текст вакансии в cron pending-rejections).
    const { firstName } = await getCandidateFirstName(candidate.id)
    const rawText = (stage.rejectText ?? "").trim().length > 0 ? stage.rejectText! : (rule.rejectText ?? "")
    const renderedText = rawText.trim().length > 0
      ? renderTemplate(rawText, {
          name:    firstName,
          vacancy: vacancy.title ?? "",
        })
      : null

    await scheduleV2Rejection(
      updatedCandidate,
      stage.id,
      rule.rejectDelayMinutes,
      renderedText ?? undefined,
    )

    console.log("[funnel-v2/completion]", JSON.stringify({
      tag:          "funnel-v2/stage-rule/reject",
      candidateId:  candidate.id,
      stageId:      stage.id,
      scorePercent,
      aiPercent,
      objectivePercent,
      aiThreshold,
      objThreshold,
      failedBy:     aiFail && objFail ? "both" : aiFail ? "ai" : "objective",
      delayMinutes: rule.rejectDelayMinutes,
    }))
    return
  }

  // Шаг 3: autoAdvance — если балл достаточный (или нет ограничения)
  if (rule.autoAdvance) {
    await advanceToNextStage(updatedCandidate, vacancy, {
      advanceTo:    rule.advanceTo,
      scoreForStage: totalScore,
    })

    console.log("[funnel-v2/completion]", JSON.stringify({
      tag:         "funnel-v2/stage-rule/advance",
      candidateId: candidate.id,
      stageId:     stage.id,
      scorePercent,
      advanceTo:   rule.advanceTo ?? "next",
    }))
    return
  }

  // Шаг 4: ни autoReject, ни autoAdvance — стадия помечена completedAt, ждём HR.
  console.log("[funnel-v2/completion]", JSON.stringify({
    tag:         "funnel-v2/stage-rule/wait-hr",
    candidateId: candidate.id,
    stageId:     stage.id,
    scorePercent,
    note:        "autoReject=false, autoAdvance=false — ждём решения HR",
  }))
}

// ────────────────────────────────────────────────────────────────────────────────
// Публичные хуки
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Хук: кандидат заполнил анкету на демо-стадии.
 *
 * Вызывается из /api/public/demo/[token]/apply ТОЛЬКО при:
 *   - vacancy.funnelV2RuntimeEnabled === true
 *   - у кандидата есть funnelV2StateJson (он в v2-воронке)
 *
 * @param candidateId  id кандидата
 * @param answersArg   Структурированные ответы (если есть; иначе пустой массив).
 */
export async function onAnketaCompleted(
  candidateId: string,
  answersArg: StructuredAnswer[] = [],
): Promise<void> {
  const loaded = await loadForCompletion(candidateId)
  if (!loaded) {
    console.warn("[funnel-v2/completion] onAnketaCompleted — кандидат/вакансия не найдены", { candidateId })
    return
  }
  const { candidate, vacancy, scores } = loaded

  // Гейт: только v2-кандидаты с активным флагом
  if (!vacancy.funnelV2RuntimeEnabled || !candidate.funnelV2StateJson) return

  const stageId = candidate.funnelV2StateJson.stageId
  const stage = vacancy.funnelV2.stages.find((s) => s.id === stageId)
  if (!stage) {
    console.warn("[funnel-v2/completion] onAnketaCompleted — стадия не найдена в конфиге", { candidateId, stageId })
    return
  }

  // Подсчёт балла: если у стадии есть contentBlockId — читаем lessonsJson
  let scorePercent = 100
  let totalScore = 0
  let objectivePercent: number | null = null
  let aiPercent: number | null = null
  if (stage.contentBlockId) {
    const lessonsJson = await loadStageLessons(stage.contentBlockId)
    const score = calcStageScore(lessonsJson, answersArg)
    scorePercent     = score.scorePercent
    totalScore       = score.totalScore
    objectivePercent = score.objectivePercent ?? null
    aiPercent        = score.aiPercent ?? null
  }

  await applyStageRule({ candidate, vacancy, stage, scorePercent, totalScore, objectivePercent, aiPercent, scores })
}

/**
 * Хук: кандидат сдал тестовое задание.
 *
 * Вызывается из /api/public/test/[token]/submit ТОЛЬКО при:
 *   - vacancy.funnelV2RuntimeEnabled === true
 *   - у кандидата есть funnelV2StateJson (он в v2-воронке)
 *
 * Фаза 3 (пункт F): onTestSubmitted вызывается ПОСЛЕ завершения processTestScoring
 * (caller передаёт финальный objectiveScore). Если в тесте есть AI-вопросы
 * (textMatchMode='ai') — вызываем calcStageScoreWithAI чтобы получить точный балл.
 * Это async-вызов: StageRule применяется к РЕАЛЬНОМУ итоговому баллу, а не промежуточному.
 *
 * @param candidateId       id кандидата
 * @param answersArg        Структурированные ответы кандидата (из structuredAnswers тела запроса).
 * @param objectiveScore    Объективный балл (0–100), если уже подсчитан кодом (опционально).
 *                          Если задан И в блоке нет AI-вопросов — используется напрямую.
 *                          Если в блоке есть AI-вопросы — всё равно запускаем calcStageScoreWithAI.
 */
export async function onTestSubmitted(
  candidateId: string,
  answersArg: StructuredAnswer[] = [],
  objectiveScore?: number,
): Promise<void> {
  const loaded = await loadForCompletion(candidateId)
  if (!loaded) {
    console.warn("[funnel-v2/completion] onTestSubmitted — кандидат/вакансия не найдены", { candidateId })
    return
  }
  const { candidate, vacancy, scores } = loaded

  // Гейт: только v2-кандидаты с активным флагом
  if (!vacancy.funnelV2RuntimeEnabled || !candidate.funnelV2StateJson) return

  const stageId = candidate.funnelV2StateJson.stageId
  const stage = vacancy.funnelV2.stages.find((s) => s.id === stageId)
  if (!stage) {
    console.warn("[funnel-v2/completion] onTestSubmitted — стадия не найдена в конфиге", { candidateId, stageId })
    return
  }

  let scorePercent = 100
  let totalScore = 0
  let objectivePercent: number | null = null
  let aiPercent: number | null = null

  if (stage.contentBlockId) {
    const lessonsJson = await loadStageLessons(stage.contentBlockId)

    // Фаза 3 (E+F): проверяем наличие AI-вопросов в блоке.
    // Если есть — запускаем полный AI-скоринг (async, точный балл).
    // Если нет — используем объективный балл (быстро, без AI).
    const quickScore = calcStageScore(lessonsJson, answersArg)

    if (quickScore.hasPendingAiQuestions) {
      // Есть AI-вопросы → нужен async AI-путь для точного балла.
      // calcStageScoreWithAI учтёт и объективные, и AI-вопросы.
      try {
        const fullScore = await calcStageScoreWithAI(lessonsJson, answersArg)
        scorePercent     = fullScore.scorePercent
        totalScore       = fullScore.totalScore
        objectivePercent = fullScore.objectivePercent ?? null
        aiPercent        = fullScore.aiPercent ?? null
      } catch (err) {
        // AI упал — деградируем к объективному баллу (безопасно).
        console.warn("[funnel-v2/completion] onTestSubmitted: AI-скоринг упал, используем объективный балл:", err instanceof Error ? err.message : err)
        scorePercent     = typeof objectiveScore === "number" ? objectiveScore : quickScore.scorePercent
        totalScore       = typeof objectiveScore === "number" ? objectiveScore : quickScore.totalScore
        objectivePercent = quickScore.objectivePercent ?? (typeof objectiveScore === "number" ? objectiveScore : null)
        aiPercent        = null  // AI не посчитан
      }
    } else if (typeof objectiveScore === "number") {
      // Нет AI-вопросов + объективный балл уже готов → используем напрямую.
      scorePercent     = objectiveScore
      totalScore       = objectiveScore
      objectivePercent = objectiveScore
    } else {
      // Нет AI-вопросов + нет готового балла → считаем объективно.
      scorePercent     = quickScore.scorePercent
      totalScore       = quickScore.totalScore
      objectivePercent = quickScore.objectivePercent ?? null
    }
  } else if (typeof objectiveScore === "number") {
    // Нет contentBlockId, но есть переданный балл (редкий случай)
    scorePercent     = objectiveScore
    totalScore       = objectiveScore
    objectivePercent = objectiveScore
  }

  // Для гейта scoreType='test' балл берём из только что посчитанного итогового
  // scorePercent теста (колонки test_score нет — она производная).
  const scoresWithTest: CandidateScores = { ...scores, testScore: scorePercent }

  await applyStageRule({ candidate, vacancy, stage, scorePercent, totalScore, objectivePercent, aiPercent, scores: scoresWithTest })
}
