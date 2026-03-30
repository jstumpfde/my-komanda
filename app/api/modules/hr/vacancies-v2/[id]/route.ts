/**
 * GET    /api/modules/hr/vacancies-v2/[id]  — одна вакансия
 * PUT    /api/modules/hr/vacancies-v2/[id]  — обновить
 * DELETE /api/modules/hr/vacancies-v2/[id]  — удалить
 */
import { NextRequest, NextResponse } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
import { requireCompany } from "@/lib/api-helpers"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { companyId } = await requireCompany()
    const { id } = await params

    const [row] = await db
      .select()
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, companyId)))
      .limit(1)

    if (!row) return NextResponse.json({ error: "Не найдено" }, { status: 404 })
    return NextResponse.json(row)
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

    const allowed = [
      "title", "city", "format", "employment", "category",
      "salaryMin", "salaryMax", "status", "descriptionJson",
    ] as const
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: Record<string, any> = { updatedAt: new Date() }
    for (const key of allowed) {
      if (key in body) update[key] = body[key]
    }

    const [row] = await db
      .update(vacancies)
      .set(update)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, companyId)))
      .returning()

    if (!row) return NextResponse.json({ error: "Не найдено" }, { status: 404 })
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

    await db
      .delete(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, companyId)))

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}
