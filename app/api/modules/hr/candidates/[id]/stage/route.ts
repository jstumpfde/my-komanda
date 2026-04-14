import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

const VALID_STAGES = [
  "new", "demo", "decision", "ai_screening", "interview",
  "final_decision", "hired", "rejected", "talent_pool",
  "pending", "preboarding",
] as const
type Stage = (typeof VALID_STAGES)[number]

export { PUT as PATCH }

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const body = await req.json() as { stage?: unknown }
    const stage = body.stage as Stage | undefined

    if (!stage || !(VALID_STAGES as readonly string[]).includes(stage)) {
      return apiError(
        `Invalid stage. Must be one of: ${VALID_STAGES.join(", ")}`,
        400
      )
    }

    // Verify candidate belongs to user's company via vacancy join
    const [row] = await db
      .select({ candidateId: candidates.id })
      .from(candidates)
      .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
      .where(and(eq(candidates.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)

    if (!row) {
      return apiError("Candidate not found", 404)
    }

    const [updated] = await db
      .update(candidates)
      .set({ stage, updatedAt: new Date() })
      .where(eq(candidates.id, id))
      .returning()

    return apiSuccess(updated)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
