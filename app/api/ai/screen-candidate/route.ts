import { NextRequest } from "next/server"
import { requireAuth, apiError, apiSuccess } from "@/lib/api-helpers"
import { logActivity } from "@/lib/activity-log"
import { screenCandidate, type ScreenInput, type ScreeningResult } from "@/lib/ai-screen-candidate"

export type { ScreeningResult }

export async function POST(req: NextRequest) {
  try {
    const authUser = await requireAuth() as { id?: string; companyId?: string }

    const body = (await req.json()) as ScreenInput
    if (!body.candidateData || !body.vacancyAnketa) {
      return apiError("Данные кандидата и анкеты обязательны", 400)
    }

    const result = await screenCandidate(body)

    if (authUser.companyId && authUser.id) {
      logActivity({
        companyId: authUser.companyId,
        userId: authUser.id,
        action: "ai_request",
        entityType: "candidate",
        module: "hr",
        details: { agent: "screen-candidate", score: result.score, verdict: result.verdict },
        request: req,
      })
    }
    return apiSuccess(result)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("screen-candidate error:", err)
    return apiError("Internal server error", 500)
  }
}
