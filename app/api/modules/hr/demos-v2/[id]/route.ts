/**
 * GET    /api/modules/hr/demos-v2/[id]
 * PUT    /api/modules/hr/demos-v2/[id]  — сохранить блоки/статус
 * DELETE /api/modules/hr/demos-v2/[id]
 */
import { NextRequest, NextResponse } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { demos, vacancies } from "@/lib/db/schema"
import { requireCompany } from "@/lib/api-helpers"

async function getDemo(companyId: string, id: string) {
  const [row] = await db
    .select({ demo: demos })
    .from(demos)
    .innerJoin(vacancies, eq(vacancies.id, demos.vacancyId))
    .where(and(eq(demos.id, id), eq(vacancies.companyId, companyId)))
    .limit(1)
  return row?.demo ?? null
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { companyId } = await requireCompany()
    const { id } = await params
    const demo = await getDemo(companyId, id)
    if (!demo) return NextResponse.json({ error: "Не найдено" }, { status: 404 })
    return NextResponse.json(demo)
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

    const demo = await getDemo(companyId, id)
    if (!demo) return NextResponse.json({ error: "Не найдено" }, { status: 404 })

    const body = await req.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: Record<string, any> = { updatedAt: new Date() }
    if ("title" in body)       update.title       = body.title
    if ("status" in body)      update.status      = body.status
    if ("lessonsJson" in body) update.lessonsJson = body.lessonsJson

    const [row] = await db
      .update(demos)
      .set(update)
      .where(eq(demos.id, id))
      .returning()

    return NextResponse.json(row)
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { companyId } = await requireCompany()
    const { id } = await params
    const demo = await getDemo(companyId, id)
    if (!demo) return NextResponse.json({ error: "Не найдено" }, { status: 404 })
    await db.delete(demos).where(eq(demos.id, id))
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}
