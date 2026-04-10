import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { learningPlans, learningAssignments } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params
    const body = await req.json() as {
      userIds?: string[]
      deadline?: string | null
    }

    const userIds = Array.isArray(body.userIds)
      ? body.userIds.filter((u): u is string => typeof u === "string" && !!u)
      : []
    if (userIds.length === 0) return apiError("'userIds' is required", 400)

    const [plan] = await db
      .select()
      .from(learningPlans)
      .where(and(eq(learningPlans.id, id), eq(learningPlans.tenantId, user.companyId)))
      .limit(1)
    if (!plan) return apiError("Plan not found", 404)

    const deadline = body.deadline && !isNaN(Date.parse(body.deadline))
      ? new Date(body.deadline)
      : null

    const rows = userIds.map((uid) => ({
      planId: id,
      userId: uid,
      tenantId: user.companyId,
      status: "assigned",
      progress: {},
      deadline,
    }))

    try {
      const created = await db.insert(learningAssignments).values(rows).returning()
      return apiSuccess({ data: { assignments: created } }, 201)
    } catch (dbErr) {
      console.error("[learning-plans/:id/assign POST] db insert failed", dbErr)
      const msg = dbErr instanceof Error ? dbErr.message : "Ошибка БД"
      return apiError(`Ошибка при назначении: ${msg}`, 500)
    }
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[learning-plans/:id/assign POST] unexpected", err)
    const msg = err instanceof Error ? err.message : "Internal server error"
    return apiError(msg, 500)
  }
}
