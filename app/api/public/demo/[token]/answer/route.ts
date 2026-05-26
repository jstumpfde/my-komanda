import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies, type VacancyRequirements } from "@/lib/db/schema"
import { apiError, apiSuccess } from "@/lib/api-helpers"
import { isShortId } from "@/lib/short-id"
import { scoreCandidateById } from "@/lib/ai-score-candidate"
import { scoreCandidateV2 } from "@/lib/ai-score-candidate-v2"

// Группа 25: fire-and-forget A/B скоринг при завершении демо.
// Если у вакансии есть must_have — запускаем v1+v2 параллельно. Иначе —
// только v1 (legacy). Не переоцениваем кандидатов с aiScoredAt != null.
async function runAbScoring(candidateId: string, vacancyId: string): Promise<void> {
  try {
    const [vac] = await db
      .select({
        requirementsJson:  vacancies.requirementsJson,
        aiProcessSettings: vacancies.aiProcessSettings,
      })
      .from(vacancies)
      .where(eq(vacancies.id, vacancyId))
      .limit(1)

    // Funnel-флаг ai_anketa_score: только явный false выключает авто-скрининг
    // анкеты (undefined/отсутствует = включено — обратная совместимость).
    // Ручная кнопка скоринга у HR (/api/vacancies/[id]/score-candidate) НЕ
    // затрагивается — она работает всегда.
    const funnelFlag = (vac?.aiProcessSettings as { aiAnketaScoreEnabled?: boolean } | null)?.aiAnketaScoreEnabled
    if (funnelFlag === false) return

    const reqJson = (vac?.requirementsJson ?? {}) as VacancyRequirements
    const hasRequirements = (reqJson.must_have?.length ?? 0) > 0

    if (!hasRequirements) {
      const v1 = await scoreCandidateById({ candidateId, vacancyId, skipIfScored: true })
      if (v1) {
        await db.update(candidates).set({
          aiScoreV1:  v1.score,
          aiScoredAt: new Date(),
        }).where(eq(candidates.id, candidateId))
      }
      return
    }

    const [v1Result, v2Result] = await Promise.all([
      scoreCandidateById({ candidateId, vacancyId, skipIfScored: true })
        .catch((err: unknown) => { console.error("[demo answer] v1 failed:", err); return null }),
      scoreCandidateV2({ candidateId, vacancyId, skipIfScored: true })
        .catch((err: unknown) => { console.error("[demo answer] v2 failed:", err); return null }),
    ])

    if (!v1Result && !v2Result) return

    const mainScore = v2Result?.score ?? v1Result?.score ?? null
    await db.update(candidates).set({
      aiScore:          mainScore,
      aiScoreV1:        v1Result?.score ?? null,
      aiScoreV2:        v2Result?.score ?? null,
      aiScoreV2Details: v2Result ?? null,
      aiScoredAt:       new Date(),
    }).where(eq(candidates.id, candidateId))
  } catch (err) {
    console.error("[demo answer] A/B scoring failed:", err instanceof Error ? err.message : err)
  }
}

interface DemoBlock {
  blockId: string
  status: "completed" | "skipped"
  timeSpent: number
  answeredAt: string
}

interface StageHistoryEntry {
  from: string | null
  to: string
  at: string
  reason: string
}

interface IncomingBlock {
  blockId: string
  answer: any
  status?: "completed" | "skipped"
  timeSpent?: number
}

const FINAL_STAGES = new Set(["hired", "rejected"])
const PRE_OPENED = new Set(["new", "primary_contact", "demo"])
const PRE_COMPLETED = new Set(["new", "primary_contact", "demo", "demo_opened"])

// Виртуальные маркеры — это служебные blockId, которые НЕ попадают в anketa_answers
// (т.к. это не пользовательские ответы, а отметки достижения этапов прогресса).
// __complete__ — последний урок завершён.
// __anketa__   — анкета финального этапа отправлена.
// __thanks__   — кандидат увидел экран «Спасибо».
const VIRTUAL_MARKERS = new Set(["__complete__", "__anketa__", "__thanks__"])

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params
    const body = await req.json()

    // Поддерживаем два формата:
    // 1) Batch: { lessonId, blocks: [{blockId, answer, status, timeSpent}], currentLesson, totalBlocks }
    //    — для всех блоков урока в одной транзакции.
    // 2) Single: { blockId, answer, timeSpent, currentBlock, totalBlocks, currentLesson, status }
    //    — для одиночных вызовов (в основном "__complete__" в конце последнего урока).
    const isBatch = Array.isArray(body?.blocks) && body.blocks.length > 0

    let incoming: IncomingBlock[]
    if (isBatch) {
      incoming = (body.blocks as any[])
        .filter((b) => b && typeof b.blockId === "string")
        .map((b) => ({
          blockId: b.blockId,
          answer: b.answer,
          status: b.status === "skipped" ? "skipped" : "completed",
          timeSpent: typeof b.timeSpent === "number" ? b.timeSpent : 0,
        }))
      if (incoming.length === 0) return apiError("blocks пустой", 400)
    } else {
      if (!body?.blockId || body.answer === undefined) {
        return apiError("blockId и answer обязательны", 400)
      }
      incoming = [{
        blockId: body.blockId,
        answer: body.answer,
        status: body.status === "skipped" ? "skipped" : "completed",
        timeSpent: typeof body.timeSpent === "number" ? body.timeSpent : 0,
      }]
    }

    const currentLesson: number | undefined =
      typeof body.currentLesson === "number" ? body.currentLesson : undefined
    const totalBlocksFromClient: number | undefined =
      typeof body.totalBlocks === "number" ? body.totalBlocks : undefined

    // Сначала находим id, чтобы внутри транзакции точно делать SELECT FOR UPDATE
    // по PRIMARY KEY (минимальный лок).
    const idRows = await db
      .select({ id: candidates.id })
      .from(candidates)
      .where(isShortId(token) ? eq(candidates.shortId, token) : eq(candidates.token, token))
      .limit(1)
    if (idRows.length === 0) return apiError("Кандидат не найден", 404)
    const candidateId = idRows[0].id

    const now = new Date().toISOString()

    const txResult = await db.transaction(async (tx) => {
      const lockedRows = await tx
        .select({
          id: candidates.id,
          vacancyId: candidates.vacancyId,
          stage: candidates.stage,
          stageHistory: candidates.stageHistory,
          anketaAnswers: candidates.anketaAnswers,
          demoProgressJson: candidates.demoProgressJson,
          aiScore: candidates.aiScore,
        })
        .from(candidates)
        .where(eq(candidates.id, candidateId))
        .for("update")
        .limit(1)
      if (lockedRows.length === 0) throw new Error("candidate disappeared inside tx")
      const candidate = lockedRows[0]

      // ── anketa_answers (legacy шаблон) ──
      const rawAnswers = candidate.anketaAnswers as unknown
      let existingAnswers: any[]
      if (Array.isArray(rawAnswers)) existingAnswers = [...rawAnswers]
      else if (rawAnswers && typeof rawAnswers === "object")
        existingAnswers = Object.values(rawAnswers as Record<string, any>)
      else existingAnswers = []

      // Применяем все incoming-блоки. Виртуальные маркеры (__complete__, __anketa__,
      // __thanks__) в anketaAnswers не пишем — это отметки прогресса, не ответы
      // кандидата. В demoProgressJson.blocks пишем все, включая виртуальные.
      for (const inc of incoming) {
        if (!VIRTUAL_MARKERS.has(inc.blockId)) {
          const idx = existingAnswers.findIndex((a: any) => a?.blockId === inc.blockId)
          const newAnswer = {
            blockId: inc.blockId,
            answer: inc.answer,
            timeSpent: inc.timeSpent ?? 0,
            answeredAt: now,
          }
          if (idx >= 0) existingAnswers[idx] = newAnswer
          else existingAnswers.push(newAnswer)
        }
      }

      // ── demo_progress_json.blocks ──
      const prevProgress = (candidate.demoProgressJson as Record<string, unknown> | null) || {}
      const prevBlocks = Array.isArray(prevProgress.blocks)
        ? (prevProgress.blocks as DemoBlock[])
        : []

      // Накапливаем blocks без дублей по blockId. Все incoming перекрывают prev.
      const incomingIds = new Set(incoming.map((b) => b.blockId))
      const filteredBlocks = prevBlocks.filter((b) => !incomingIds.has(b.blockId))
      const newBlocks: DemoBlock[] = incoming.map((inc) => ({
        blockId: inc.blockId,
        status: inc.status ?? "completed",
        timeSpent: inc.timeSpent ?? 0,
        answeredAt: now,
      }))
      const updatedBlocks = [...filteredBlocks, ...newBlocks]

      // hasVideoVizitka — пересчёт по обновлённым anketaAnswers.
      const hasVideoVizitka = existingAnswers.some((a: any) =>
        a?.answer && typeof a.answer === "object" &&
        (a.answer as any).mediaType === "video" &&
        typeof (a.answer as any).url === "string" &&
        (a.answer as any).url.length > 0
      )

      // Сервер сам считает completedCount по итоговым blocks (исключая __complete__).
      const completedCount = updatedBlocks.filter(
        (b) => b.status === "completed" && b.blockId !== "__complete__"
      ).length

      const isComplete = incoming.some((b) => b.blockId === "__complete__")

      const progress = {
        ...prevProgress,
        schemaVersion: 2,
        blocks: updatedBlocks,
        currentBlock: completedCount,
        totalBlocks: totalBlocksFromClient ?? prevProgress.totalBlocks ?? 0,
        currentLesson: currentLesson ?? prevProgress.currentLesson ?? 0,
        hasVideoVizitka,
        completedAt: isComplete ? now : (prevProgress.completedAt ?? null),
        lastUpdated: now,
      }

      // ── Stage transitions ──
      const currentStage = candidate.stage ?? "new"
      let newStage: string | null = null
      let stageReason: string | null = null

      if (!FINAL_STAGES.has(currentStage)) {
        // F2.A: первый ответ из ранних стадий → demo_opened.
        // prevBlocks был пустой (до текущего batch) и в batch есть НЕ-виртуальный блок.
        const hasRealBlock = incoming.some((b) => !VIRTUAL_MARKERS.has(b.blockId))
        if (PRE_OPENED.has(currentStage) && prevBlocks.length === 0 && hasRealBlock && !isComplete) {
          newStage = "demo_opened"
          stageReason = "demo_started"
        }
        // F2.B: финальный шаг → decision (Вариант A — опциональное видео не блокирует).
        if (isComplete && PRE_COMPLETED.has(currentStage)) {
          newStage = "decision"
          stageReason = "demo_completed"
        }
      }

      const stageHistory = (candidate.stageHistory as StageHistoryEntry[] | null) || []
      const updates: Record<string, unknown> = {
        anketaAnswers: existingAnswers,
        demoProgressJson: progress,
        updatedAt: new Date(),
      }
      if (newStage && newStage !== currentStage) {
        updates.stage = newStage
        updates.stageHistory = [
          ...stageHistory,
          { from: currentStage, to: newStage, at: now, reason: stageReason },
        ]
      }

      await tx.update(candidates).set(updates).where(eq(candidates.id, candidate.id))

      return {
        stage: newStage ?? currentStage,
        isComplete,
        aiScoreNull: candidate.aiScore == null,
        vacancyId: candidate.vacancyId,
        candidateId: candidate.id,
      }
    })

    // Авто AI-скоринг при завершении демо (вне транзакции, fire-and-forget).
    // Группа 25: запускает v1+v2 параллельно, если у вакансии есть структурированные требования.
    if (txResult.isComplete && txResult.aiScoreNull) {
      void runAbScoring(txResult.candidateId, txResult.vacancyId)
    }

    return apiSuccess({ ok: true, stage: txResult.stage })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("POST /api/public/demo/[token]/answer", err)
    return apiError("Internal server error", 500)
  }
}
