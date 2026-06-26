// POST /api/platform/funnel-v2-sim
//
// READ-ONLY диагностика воронки v2: «сухой прогон» кандидата по всем стадиям
// БЕЗ единой записи в БД (in-memory состояние + реальные данные вакансии).
// Проверяет живую обвязку движка: resolveCurrentStageContent (контент-блоки),
// calcStageScore (реальные вопросы анкет, сильный/слабый набор ответов) и
// решение правила стадии (авто-отказ / авто-переход / ждём HR).
//
// Защита: X-Platform-Admin-Key. Body: { vacancyId, companyId }.
// НИЧЕГО не пишет — безопасно гонять на проде.

import { NextRequest, NextResponse } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
import { requirePlatformKey } from "@/lib/platform/auth"
import { normalizeFunnelV2 } from "@/lib/funnel-v2/types"
import { resolveCurrentStageContent } from "@/lib/funnel-v2/resolve-content"
import { calcStageScore } from "@/lib/funnel-v2/calc-stage-score"
import { nextStageId } from "@/lib/funnel-v2/advance-stage"
import { collectTaskQuestions, resolveOptionPoints, type StructuredAnswer } from "@/lib/score-test-objective"
import type { Question } from "@/lib/course-types"
import type { CandidateForExecutor, VacancyForExecutor } from "@/lib/funnel-v2/runtime-executor"

export const dynamic = "force-dynamic"

const SEP = "|||"

/** Собрать сильный («good») или слабый («weak») набор ответов по вопросам блока. */
function buildAnswers(questions: Question[], blockId: string, mode: "good" | "weak"): StructuredAnswer[] {
  const out: StructuredAnswer[] = []
  for (const q of questions) {
    const opts = q.options ?? []
    let value = ""
    const op = resolveOptionPoints(q) // баллы на вариант (учитывает optionPoints/correctOptions)

    if (q.answerType === "single") {
      if (opts.length) {
        const idx = mode === "good"
          ? op.indexOf(Math.max(...op))
          : op.indexOf(Math.min(...op))
        value = opts[idx >= 0 ? idx : 0] ?? ""
      }
    } else if (q.answerType === "multiple") {
      if (mode === "good") {
        value = opts.filter((_, i) => (op[i] ?? 0) > 0).join(SEP) // все плюсовые
      } else {
        value = "" // ничего не выбрал
      }
    } else if (q.answerType === "yesno") {
      const correct = q.correctYesNo === "yes" || q.correctYesNo === "no" ? q.correctYesNo : "yes"
      value = mode === "good" ? correct : (correct === "yes" ? "no" : "yes")
    } else if (q.answerType === "sort") {
      if (mode === "good" && Array.isArray(q.correctSort)) {
        value = q.correctSort.map((i) => opts[i] ?? "").filter(Boolean).join(SEP)
      } else {
        value = ""
      }
    } else {
      // текстовые (short/long/text) — calcStageScore (sync) их не считает (AI отдельно)
      value = mode === "good" ? "ChatGPT, Claude, Midjourney, n8n — контент, промты, автоматизации" : ""
    }

    out.push({ blockId, questionId: q.id, answerType: q.answerType, value })
  }
  return out
}

function decide(rule: { autoReject?: boolean; autoAdvance?: boolean; threshold?: number }, scorePercent: number): string {
  const threshold = typeof rule.threshold === "number" ? rule.threshold : 0
  if (rule.autoReject && scorePercent < threshold) return `АВТО-ОТКАЗ (балл ${scorePercent} < порог ${threshold})`
  if (rule.autoAdvance) return "АВТО-ПЕРЕХОД"
  return "ЖДЁМ HR (ручное подтверждение)"
}

export async function POST(req: NextRequest) {
  const denied = requirePlatformKey(req)
  if (denied) return denied

  const body = (await req.json().catch(() => ({}))) as { vacancyId?: string; companyId?: string }
  if (!body.vacancyId || !body.companyId) {
    return NextResponse.json({ error: "vacancyId и companyId обязательны" }, { status: 400 })
  }

  const [vac] = await db.select({
    id: vacancies.id,
    title: vacancies.title,
    companyId: vacancies.companyId,
    descriptionJson: vacancies.descriptionJson,
    runtime: vacancies.funnelV2RuntimeEnabled,
  }).from(vacancies).where(and(eq(vacancies.id, body.vacancyId), eq(vacancies.companyId, body.companyId))).limit(1)

  if (!vac) return NextResponse.json({ error: "Вакансия не найдена (проверьте companyId)" }, { status: 404 })

  const descJson = (vac.descriptionJson ?? {}) as Record<string, unknown>
  const funnelV2 = normalizeFunnelV2(descJson.funnelV2)

  const vacancyForExec: VacancyForExecutor = {
    id: vac.id,
    title: vac.title,
    companyId: vac.companyId,
    funnelV2,
    funnelV2RuntimeEnabled: !!vac.runtime,
  }

  const nowIso = new Date(0).toISOString() // фиксируем (Date.now недоступен в детермин. среде)

  const trace: unknown[] = []

  for (let i = 0; i < funnelV2.stages.length; i++) {
    const stage = funnelV2.stages[i]
    const cand: CandidateForExecutor = {
      id: "__sim__",
      token: "__sim__",
      name: "Тест Кандидат",
      email: null,
      phone: null,
      vacancyId: vac.id,
      funnelV2StateJson: {
        stageId: stage.id,
        enteredAt: nowIso,
        completedAt: null,
        scoreForStage: null,
        pendingRejectionStageId: null,
        touchesSent: 0,
        dozhimStartedAt: null,
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
      contentBlock: resolved
        ? { demoKind: resolved.demoKind, title: resolved.title, lessons: lessonCount }
        : null,
    }

    // Стадии с вопросами (анкета/тест) — гоняем реальный скоринг.
    if ((stage.action === "prequalification" || stage.action === "test" || stage.action === "task") && lessons) {
      const questions = collectTaskQuestions(
        lessons as { blocks?: { type?: string; questions?: Question[] }[] }[],
      )
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
      // Демо/интервью/оффер — балл не считается, решение по правилу при score=100.
      entry.decision = decide(stage.rule, 100)
    }

    const next = nextStageId(funnelV2.stages, stage.id, stage.rule.advanceTo ?? "next")
    entry.nextStageId = next
    trace.push(entry)
  }

  return NextResponse.json({
    ok: true,
    vacancy: { id: vac.id, title: vac.title, funnelV2RuntimeEnabled: !!vac.runtime },
    funnelEnabled: funnelV2.enabled,
    stageCount: funnelV2.stages.length,
    trace,
  })
}
