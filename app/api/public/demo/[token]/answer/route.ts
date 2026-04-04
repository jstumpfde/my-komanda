import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates } from "@/lib/db/schema"
import { apiError, apiSuccess } from "@/lib/api-helpers"

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

    // Find candidate
    const candidateRows = await db
      .select({
        id: candidates.id,
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

    // Update anketa answers — append or replace by blockId
    const existingAnswers = (candidate.anketaAnswers as any[] | null) || []
    const answerIndex = existingAnswers.findIndex((a: any) => a.blockId === blockId)
    const newAnswer = { blockId, answer, timeSpent: timeSpent || 0, answeredAt: new Date().toISOString() }

    if (answerIndex >= 0) {
      existingAnswers[answerIndex] = newAnswer
    } else {
      existingAnswers.push(newAnswer)
    }

    // Update progress
    const progress = {
      ...(candidate.demoProgressJson as any || {}),
      currentBlock: currentBlock ?? 0,
      totalBlocks: totalBlocks ?? 0,
      lastUpdated: new Date().toISOString(),
    }

    await db
      .update(candidates)
      .set({
        anketaAnswers: existingAnswers,
        demoProgressJson: progress,
        updatedAt: new Date(),
      })
      .where(eq(candidates.id, candidate.id))

    return apiSuccess({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("POST /api/public/demo/[token]/answer", err)
    return apiError("Internal server error", 500)
  }
}
