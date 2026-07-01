// Read-only «сухой прогон» воронки v2: проходим кандидатом по всем стадиям
// БЕЗ записи в БД (in-memory состояние + реальные данные вакансии). Проверяет
// живую обвязку: resolveCurrentStageContent (контент-блоки), calcStageScore
// (реальные вопросы анкет, сильный/слабый набор) и решение правила стадии.
//
// Используется и платформенным эндпоинтом (X-Platform-Admin-Key), и HR-эндпоинтом
// (сессия, своя компания) — поэтому вынесено в общий модуль.

import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
import { normalizeFunnelV2 } from "@/lib/funnel-v2/types"
import { resolveCurrentStageContent } from "@/lib/funnel-v2/resolve-content"
import { calcStageScore } from "@/lib/funnel-v2/calc-stage-score"
import { nextStageId } from "@/lib/funnel-v2/advance-stage"
import { collectTaskQuestions, resolveOptionPoints, type StructuredAnswer } from "@/lib/score-test-objective"
import type { Question } from "@/lib/course-types"
import type { CandidateForExecutor, VacancyForExecutor } from "@/lib/funnel-v2/runtime-executor"

const SEP = "|||"

export interface SimResult {
  ok: boolean
  error?: string
  vacancy?: { id: string; title: string | null; funnelV2RuntimeEnabled: boolean }
  funnelEnabled?: boolean
  stageCount?: number
  trace?: unknown[]
}

/** Собрать сильный/слабый набор ответов по вопросам блока. */
function buildAnswers(questions: Question[], blockId: string, mode: "good" | "weak"): StructuredAnswer[] {
  const out: StructuredAnswer[] = []
  for (const q of questions) {
    const opts = q.options ?? []
    let value = ""
    const op = resolveOptionPoints(q)

    if (q.answerType === "single") {
      if (opts.length) {
        const idx = mode === "good" ? op.indexOf(Math.max(...op)) : op.indexOf(Math.min(...op))
        value = opts[idx >= 0 ? idx : 0] ?? ""
      }
    } else if (q.answerType === "multiple") {
      value = mode === "good" ? opts.filter((_, i) => (op[i] ?? 0) > 0).join(SEP) : ""
    } else if (q.answerType === "yesno") {
      const correct = q.correctYesNo === "yes" || q.correctYesNo === "no" ? q.correctYesNo : "yes"
      value = mode === "good" ? correct : (correct === "yes" ? "no" : "yes")
    } else if (q.answerType === "sort") {
      value = mode === "good" && Array.isArray(q.correctSort) ? q.correctSort.map((i) => opts[i] ?? "").filter(Boolean).join(SEP) : ""
    } else {
      value = mode === "good" ? "ChatGPT, Claude, Midjourney, n8n — контент, промты, автоматизации" : ""
    }
    out.push({ blockId, questionId: q.id, answerType: q.answerType, value })
  }
  return out
}

function decide(rule: { autoReject?: boolean; autoAdvance?: boolean; threshold?: number; objThreshold?: number }, scorePercent: number): string {
  // Сухой прогон использует объективный балл (синтетические ответы, без AI),
  // поэтому оба порога сравниваем с одним scorePercent.
  const aiT  = typeof rule.threshold    === "number" ? rule.threshold    : undefined
  const objT = typeof rule.objThreshold === "number" ? rule.objThreshold : undefined
  const aiFail  = typeof aiT  === "number" && scorePercent < aiT
  const objFail = typeof objT === "number" && scorePercent < objT
  if (rule.autoReject && (aiFail || objFail)) {
    const reasons: string[] = []
    if (aiFail)  reasons.push(`AI ${scorePercent} < ${aiT}`)
    if (objFail) reasons.push(`ответы ${scorePercent} < ${objT}`)
    return `АВТО-ОТКАЗ (${reasons.join(", ")})`
  }
  if (rule.autoAdvance) return "АВТО-ПЕРЕХОД"
  return "ЖДЁМ HR (ручное подтверждение)"
}

/**
 * Сухой прогон воронки v2 для вакансии. companyId обязателен (проверка тенанта).
 * НИЧЕГО не пишет в БД.
 */
export async function simulateFunnelV2(vacancyId: string, companyId: string): Promise<SimResult> {
  const [vac] = await db.select({
    id: vacancies.id,
    title: vacancies.title,
    companyId: vacancies.companyId,
    descriptionJson: vacancies.descriptionJson,
    runtime: vacancies.funnelV2RuntimeEnabled,
  }).from(vacancies).where(and(eq(vacancies.id, vacancyId), eq(vacancies.companyId, companyId))).limit(1)

  if (!vac) return { ok: false, error: "Вакансия не найдена" }

  const descJson = (vac.descriptionJson ?? {}) as Record<string, unknown>
  const funnelV2 = normalizeFunnelV2(descJson.funnelV2)

  const vacancyForExec: VacancyForExecutor = {
    id: vac.id,
    title: vac.title,
    companyId: vac.companyId,
    funnelV2,
    funnelV2RuntimeEnabled: !!vac.runtime,
  }

  const nowIso = new Date(0).toISOString()
  const trace: unknown[] = []

  for (let i = 0; i < funnelV2.stages.length; i++) {
    const stage = funnelV2.stages[i]
    const cand: CandidateForExecutor = {
      id: "__sim__", token: "__sim__", name: "Тест Кандидат",
      email: null, phone: null, vacancyId: vac.id,
      funnelV2StateJson: {
        stageId: stage.id, enteredAt: nowIso, completedAt: null,
        scoreForStage: null, pendingRejectionStageId: null,
        touchesSent: 0, dozhimStartedAt: null,
      },
    }

    const resolved = await resolveCurrentStageContent(cand, vacancyForExec)
    const lessons = resolved?.lessonsJson
    const lessonCount = Array.isArray(lessons) ? lessons.length : 0

    const entry: Record<string, unknown> = {
      step: i + 1,
      stageId: stage.id,
      title: stage.title,
      action: stage.action,
      contentBlock: resolved ? { demoKind: resolved.demoKind, title: resolved.title, lessons: lessonCount } : null,
    }

    if ((stage.action === "prequalification" || stage.action === "test" || stage.action === "task") && lessons) {
      const questions = collectTaskQuestions(lessons as { blocks?: { type?: string; questions?: Question[] }[] }[])
      const blockId = resolved?.contentBlockId ?? ""
      const good = calcStageScore(lessons, buildAnswers(questions, blockId, "good"))
      const weak = calcStageScore(lessons, buildAnswers(questions, blockId, "weak"))
      entry.scoring = {
        questions: questions.length,
        gradedObjective: good.gradedCount,
        hasAiQuestions: !!good.hasPendingAiQuestions,
        strong: { scorePercent: good.scorePercent, decision: decide(stage.rule, good.scorePercent) },
        weak: { scorePercent: weak.scorePercent, decision: decide(stage.rule, weak.scorePercent) },
      }
    } else {
      entry.decision = decide(stage.rule, 100)
    }

    entry.nextStageId = nextStageId(funnelV2.stages, stage.id, stage.rule.advanceTo ?? "next")
    trace.push(entry)
  }

  return {
    ok: true,
    vacancy: { id: vac.id, title: vac.title, funnelV2RuntimeEnabled: !!vac.runtime },
    funnelEnabled: funnelV2.enabled,
    stageCount: funnelV2.stages.length,
    trace,
  }
}
