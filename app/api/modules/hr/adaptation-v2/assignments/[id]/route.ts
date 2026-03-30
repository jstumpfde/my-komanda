/**
 * GET    /api/modules/hr/adaptation-v2/assignments/[id]  — назначение + шаги + прогресс
 * PUT    /api/modules/hr/adaptation-v2/assignments/[id]  — обновить статус / отметить шаг
 */
import { NextRequest, NextResponse } from "next/server"
import { eq, and, asc } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  adaptationAssignments, adaptationPlans, adaptationSteps, stepCompletions,
} from "@/lib/db/schema"
import { requireCompany } from "@/lib/api-helpers"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { companyId } = await requireCompany()
    const { id } = await params

    const [row] = await db
      .select({
        assignment: adaptationAssignments,
        plan: adaptationPlans,
      })
      .from(adaptationAssignments)
      .innerJoin(adaptationPlans, eq(adaptationPlans.id, adaptationAssignments.planId))
      .where(
        and(eq(adaptationAssignments.id, id), eq(adaptationPlans.tenantId, companyId))
      )
      .limit(1)

    if (!row) return NextResponse.json({ error: "Не найдено" }, { status: 404 })

    const steps = await db
      .select()
      .from(adaptationSteps)
      .where(eq(adaptationSteps.planId, row.assignment.planId))
      .orderBy(asc(adaptationSteps.dayNumber), asc(adaptationSteps.sortOrder))

    const completions = await db
      .select()
      .from(stepCompletions)
      .where(eq(stepCompletions.assignmentId, id))

    return NextResponse.json({
      ...row.assignment,
      plan: row.plan,
      steps,
      completions,
    })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { companyId } = await requireCompany()
    const { id } = await params
    const body = await req.json()
    const action = req.nextUrl.searchParams.get("action")

    // Проверяем доступ
    const [row] = await db
      .select({ assignment: adaptationAssignments })
      .from(adaptationAssignments)
      .innerJoin(adaptationPlans, eq(adaptationPlans.id, adaptationAssignments.planId))
      .where(and(eq(adaptationAssignments.id, id), eq(adaptationPlans.tenantId, companyId)))
      .limit(1)

    if (!row) return NextResponse.json({ error: "Не найдено" }, { status: 404 })

    // Отметить шаг как выполненный
    if (action === "completeStep") {
      const { stepId } = body
      await db
        .insert(stepCompletions)
        .values({
          assignmentId: id,
          stepId,
          status: "completed",
          completedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [stepCompletions.assignmentId, stepCompletions.stepId],
          set: { status: "completed", completedAt: new Date() },
        })

      // Пересчитываем прогресс
      const total = row.assignment.totalSteps ?? 0
      const [{ completedCount }] = await db
        .select({ completedCount: (await import("drizzle-orm")).count() })
        .from(stepCompletions)
        .where(and(eq(stepCompletions.assignmentId, id), eq(stepCompletions.status, "completed")))

      const completionPct = total > 0 ? Math.round((completedCount / total) * 100) : 0
      const isCompleted = completionPct === 100

      const [updated] = await db
        .update(adaptationAssignments)
        .set({
          completedSteps: completedCount,
          completionPct,
          status: isCompleted ? "completed" : row.assignment.status,
          completedAt: isCompleted ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(adaptationAssignments.id, id))
        .returning()

      return NextResponse.json(updated)
    }

    // Обновить статус назначения
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: Record<string, any> = { updatedAt: new Date() }
    if ("status" in body) update.status = body.status
    if ("currentDay" in body) update.currentDay = body.currentDay

    const [updated] = await db
      .update(adaptationAssignments)
      .set(update)
      .where(eq(adaptationAssignments.id, id))
      .returning()

    return NextResponse.json(updated)
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}
