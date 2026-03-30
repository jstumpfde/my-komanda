/**
 * GET    /api/modules/hr/adaptation-v2/plans/[id]  — план + шаги
 * PUT    /api/modules/hr/adaptation-v2/plans/[id]  — обновить план
 * DELETE /api/modules/hr/adaptation-v2/plans/[id]  — удалить
 *
 * Шаги (steps) — через query param:
 * POST   .../plans/[id]?action=addStep
 * DELETE .../plans/[id]?action=deleteStep&stepId=...
 */
import { NextRequest, NextResponse } from "next/server"
import { eq, and, asc } from "drizzle-orm"
import { db } from "@/lib/db"
import { adaptationPlans, adaptationSteps } from "@/lib/db/schema"
import { requireCompany } from "@/lib/api-helpers"

async function getPlan(companyId: string, planId: string) {
  const [plan] = await db
    .select()
    .from(adaptationPlans)
    .where(and(eq(adaptationPlans.id, planId), eq(adaptationPlans.tenantId, companyId)))
    .limit(1)
  return plan ?? null
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { companyId } = await requireCompany()
    const { id } = await params
    const plan = await getPlan(companyId, id)
    if (!plan) return NextResponse.json({ error: "Не найдено" }, { status: 404 })

    const steps = await db
      .select()
      .from(adaptationSteps)
      .where(eq(adaptationSteps.planId, id))
      .orderBy(asc(adaptationSteps.dayNumber), asc(adaptationSteps.sortOrder))

    return NextResponse.json({ ...plan, steps })
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
    const plan = await getPlan(companyId, id)
    if (!plan) return NextResponse.json({ error: "Не найдено" }, { status: 404 })

    const body = await req.json()
    const action = req.nextUrl.searchParams.get("action")

    // Добавить шаг
    if (action === "addStep") {
      const { dayNumber = 1, title, type = "task", content } = body
      const [step] = await db
        .insert(adaptationSteps)
        .values({ planId: id, dayNumber, title: title ?? "Новый шаг", type, content })
        .returning()
      return NextResponse.json(step, { status: 201 })
    }

    // Обновить план
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: Record<string, any> = { updatedAt: new Date() }
    if ("title" in body) update.title = body.title
    if ("description" in body) update.description = body.description
    if ("durationDays" in body) update.durationDays = body.durationDays
    if ("isActive" in body) update.isActive = body.isActive

    const [updated] = await db
      .update(adaptationPlans)
      .set(update)
      .where(eq(adaptationPlans.id, id))
      .returning()

    return NextResponse.json(updated)
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { companyId } = await requireCompany()
    const { id } = await params
    const action = req.nextUrl.searchParams.get("action")
    const stepId = req.nextUrl.searchParams.get("stepId")

    const plan = await getPlan(companyId, id)
    if (!plan) return NextResponse.json({ error: "Не найдено" }, { status: 404 })

    if (action === "deleteStep" && stepId) {
      await db.delete(adaptationSteps).where(eq(adaptationSteps.id, stepId))
      return NextResponse.json({ ok: true })
    }

    await db.delete(adaptationPlans).where(eq(adaptationPlans.id, id))
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}
