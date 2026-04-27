import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates } from "@/lib/db/schema"
import { apiError, apiSuccess } from "@/lib/api-helpers"

interface DemoBlock {
  blockId: string
  status: string
  timeSpent: number
  answeredAt: string
}

interface StageHistoryEntry {
  from: string | null
  to: string
  at: string
  reason: string
}

const FINAL_STAGES = new Set(["hired", "rejected"])

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params
    const body = await req.json()

    const { blockId, answer, timeSpent, currentBlock, totalBlocks } = body

    if (!blockId || answer === undefined) {
      return apiError("blockId и answer обязательны", 400)
    }

    const candidateRows = await db
      .select({
        id: candidates.id,
        stage: candidates.stage,
        stageHistory: candidates.stageHistory,
        anketaAnswers: candidates.anketaAnswers,
        demoProgressJson: candidates.demoProgressJson,
      })
      .from(candidates)
      .where(eq(candidates.token, token))
      .limit(1)

    if (candidateRows.length === 0) {
      return apiError("Кандидат не найден", 404)
    }

    const candidate = candidateRows[0]
    const now = new Date().toISOString()

    // ── anketa_answers (legacy шаблон [{blockId, answer, ...}]) ──
    // Нормализуем — БД может хранить как массив или как объект {"0":{...},"1":{...}}
    const rawAnswers = candidate.anketaAnswers as unknown
    let existingAnswers: any[]
    if (Array.isArray(rawAnswers)) {
      existingAnswers = rawAnswers
    } else if (rawAnswers && typeof rawAnswers === 'object') {
      existingAnswers = Object.values(rawAnswers as Record<string, any>)
    } else {
      existingAnswers = []
    }
    const answerIndex = existingAnswers.findIndex((a: any) => a.blockId === blockId)
    const newAnswer = { blockId, answer, timeSpent: timeSpent || 0, answeredAt: now }
    if (answerIndex >= 0) {
      existingAnswers[answerIndex] = newAnswer
    } else {
      existingAnswers.push(newAnswer)
    }

    // ── demo_progress_json: накапливаем blocks[] (без дублей по blockId) ──
    const prevProgress = (candidate.demoProgressJson as Record<string, unknown> | null) || {}
    const prevBlocks = Array.isArray(prevProgress.blocks) ? (prevProgress.blocks as DemoBlock[]) : []
    const filteredBlocks = prevBlocks.filter(b => b.blockId !== blockId)
    const isComplete = blockId === "__complete__"
    const newBlock: DemoBlock = {
      blockId,
      status: "completed",
      timeSpent: timeSpent || 0,
      answeredAt: now,
    }
    const updatedBlocks = [...filteredBlocks, newBlock]
    const progress = {
      ...prevProgress,
      blocks: updatedBlocks,
      currentBlock: currentBlock ?? prevProgress.currentBlock ?? 0,
      totalBlocks: totalBlocks ?? prevProgress.totalBlocks ?? 0,
      completedAt: isComplete ? now : (prevProgress.completedAt ?? null),
      lastUpdated: now,
    }

    // ── Авто-переход stage ──
    const currentStage = candidate.stage ?? "new"
    let newStage: string | null = null
    let stageReason: string | null = null

    if (!FINAL_STAGES.has(currentStage)) {
      // F2.A: первый ответ + stage='new' → demo
      if (currentStage === "new" && prevBlocks.length === 0 && !isComplete) {
        newStage = "demo"
        stageReason = "demo_started"
      }
      // F2.B: финальный шаг → decision (только из new/demo, чтобы не регрессить)
      if (isComplete && (currentStage === "new" || currentStage === "demo")) {
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

    await db.update(candidates).set(updates).where(eq(candidates.id, candidate.id))

    return apiSuccess({ ok: true, stage: newStage ?? currentStage })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("POST /api/public/demo/[token]/answer", err)
    return apiError("Internal server error", 500)
  }
}
