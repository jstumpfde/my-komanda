/**
 * GET  /api/modules/hr/adaptation-v2/plans  — список планов
 * POST /api/modules/hr/adaptation-v2/plans  — создать план
 */
import { NextRequest, NextResponse } from "next/server"
import { eq, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { adaptationPlans, adaptationSteps } from "@/lib/db/schema"
import { requireCompany } from "@/lib/api-helpers"
import { count } from "drizzle-orm"

export async function GET() {
  try {
    const { companyId } = await requireCompany()

    const rows = await db
      .select({
        id: adaptationPlans.id,
        title: adaptationPlans.title,
        description: adaptationPlans.description,
        durationDays: adaptationPlans.durationDays,
        planType: adaptationPlans.planType,
        isActive: adaptationPlans.isActive,
        isTemplate: adaptationPlans.isTemplate,
        createdAt: adaptationPlans.createdAt,
      })
      .from(adaptationPlans)
      .where(eq(adaptationPlans.tenantId, companyId))
      .orderBy(desc(adaptationPlans.createdAt))

    // Добавляем кол-во шагов для каждого плана
    const withCounts = await Promise.all(
      rows.map(async (plan) => {
        const [{ stepsCount }] = await db
          .select({ stepsCount: count() })
          .from(adaptationSteps)
          .where(eq(adaptationSteps.planId, plan.id))
        return { ...plan, stepsCount }
      })
    )

    return NextResponse.json(withCounts)
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { companyId, userId } = await requireCompany()
    const body = await req.json()
    const { title, description, durationDays = 14, planType = "onboarding" } = body

    if (!title) return NextResponse.json({ error: "title обязателен" }, { status: 400 })

    const [plan] = await db
      .insert(adaptationPlans)
      .values({ tenantId: companyId, createdBy: userId, title, description, durationDays, planType })
      .returning()

    return NextResponse.json(plan, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}
