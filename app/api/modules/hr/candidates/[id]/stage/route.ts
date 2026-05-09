import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { trySyncRejectToHh, trySyncInviteToHh } from "@/lib/hh/sync-stage"

const VALID_STAGES = [
  "new", "primary_contact", "demo", "demo_opened", "decision",
  "anketa_filled", "ai_screening", "interview", "final_decision",
  "hired", "rejected", "talent_pool", "pending", "preboarding",
] as const
type Stage = (typeof VALID_STAGES)[number]

// Стейджи «после приглашения». Если кандидат уже был в одном из них
// и его переводят в primary_contact — это внутренняя ручная корректировка,
// hh-инвайт повторно не отправляем (он уже его получил).
const POST_INVITE_STAGES: ReadonlySet<Stage> = new Set([
  "primary_contact", "demo_opened", "demo", "anketa_filled",
  "decision", "ai_screening", "interview", "final_decision", "hired",
])

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

    // Verify candidate belongs to user's company via vacancy join.
    // Возвращаем previousStage чтобы понять, нужен ли hh-инвайт.
    const [row] = await db
      .select({ candidateId: candidates.id, previousStage: candidates.stage })
      .from(candidates)
      .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
      .where(and(eq(candidates.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)

    if (!row) {
      return apiError("Candidate not found", 404)
    }

    const stopAutoProcessing = stage === "rejected"

    const [updated] = await db
      .update(candidates)
      .set({
        stage,
        updatedAt: new Date(),
        ...(stopAutoProcessing
          ? {
              autoProcessingStopped: true,
              autoProcessingStoppedReason: "manual_rejection",
              autoProcessingStoppedAt: new Date(),
            }
          : {}),
      })
      .where(eq(candidates.id, id))
      .returning()

    // Sync с hh.ru — fire-and-forget, ошибка не блокирует ответ.
    if (stage === "rejected") {
      trySyncRejectToHh(id).catch((err) => {
        console.warn(`[stage-route] hh reject sync failed for ${id}:`, err)
      })
    } else if (
      stage === "primary_contact"
      && row.previousStage !== null
      && !POST_INVITE_STAGES.has(row.previousStage as Stage)
    ) {
      trySyncInviteToHh(id).catch((err) => {
        console.warn(`[stage-route] hh invite sync failed for ${id}:`, err)
      })
    }

    return apiSuccess(updated)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
