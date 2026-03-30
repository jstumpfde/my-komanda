/**
 * GET  /api/modules/hr/adaptation-v2/assignments  — назначения компании
 * POST /api/modules/hr/adaptation-v2/assignments  — создать назначение
 */
import { NextRequest, NextResponse } from "next/server"
import { eq, desc, count } from "drizzle-orm"
import { db } from "@/lib/db"
import { adaptationAssignments, adaptationPlans, adaptationSteps } from "@/lib/db/schema"
import { requireCompany } from "@/lib/api-helpers"

export async function GET() {
  try {
    const { companyId } = await requireCompany()

    const rows = await db
      .select({
        id: adaptationAssignments.id,
        planId: adaptationAssignments.planId,
        planTitle: adaptationPlans.title,
        employeeId: adaptationAssignments.employeeId,
        buddyId: adaptationAssignments.buddyId,
        startDate: adaptationAssignments.startDate,
        status: adaptationAssignments.status,
        currentDay: adaptationAssignments.currentDay,
        completionPct: adaptationAssignments.completionPct,
        totalSteps: adaptationAssignments.totalSteps,
        completedSteps: adaptationAssignments.completedSteps,
        createdAt: adaptationAssignments.createdAt,
      })
      .from(adaptationAssignments)
      .innerJoin(adaptationPlans, eq(adaptationPlans.id, adaptationAssignments.planId))
      .where(eq(adaptationPlans.tenantId, companyId))
      .orderBy(desc(adaptationAssignments.createdAt))

    return NextResponse.json(rows)
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { companyId } = await requireCompany()
    const body = await req.json()
    const { planId, employeeId, buddyId, startDate } = body

    if (!planId) return NextResponse.json({ error: "planId обязателен" }, { status: 400 })

    // Проверяем план принадлежит компании
    const [plan] = await db
      .select({ id: adaptationPlans.id })
      .from(adaptationPlans)
      .where(eq(adaptationPlans.id, planId))
      .limit(1)
    if (!plan) return NextResponse.json({ error: "План не найден" }, { status: 404 })

    // Считаем кол-во шагов в плане
    const [{ stepsCount }] = await db
      .select({ stepsCount: count() })
      .from(adaptationSteps)
      .where(eq(adaptationSteps.planId, planId))

    const [assignment] = await db
      .insert(adaptationAssignments)
      .values({
        planId,
        employeeId: employeeId ?? null,
        buddyId: buddyId ?? null,
        startDate: startDate ? new Date(startDate) : new Date(),
        status: "active",
        currentDay: 1,
        completionPct: 0,
        totalSteps: stepsCount,
        completedSteps: 0,
      })
      .returning()

    return NextResponse.json(assignment, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}
