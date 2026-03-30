/**
 * GET  /api/modules/hr/demos-v2?vacancyId=...  — список демо компании
 * POST /api/modules/hr/demos-v2               — создать демо
 */
import { NextRequest, NextResponse } from "next/server"
import { eq, and, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { demos, vacancies } from "@/lib/db/schema"
import { requireCompany } from "@/lib/api-helpers"

export async function GET(req: NextRequest) {
  try {
    const { companyId } = await requireCompany()
    const vacancyId = req.nextUrl.searchParams.get("vacancyId")

    const rows = await db
      .select({
        id: demos.id,
        title: demos.title,
        status: demos.status,
        vacancyId: demos.vacancyId,
        vacancyTitle: vacancies.title,
        createdAt: demos.createdAt,
        updatedAt: demos.updatedAt,
      })
      .from(demos)
      .innerJoin(vacancies, eq(vacancies.id, demos.vacancyId))
      .where(
        and(
          eq(vacancies.companyId, companyId),
          vacancyId ? eq(demos.vacancyId, vacancyId) : undefined,
        )
      )
      .orderBy(desc(demos.createdAt))

    return NextResponse.json(rows)
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { companyId } = await requireCompany()
    const body = await req.json()
    const { vacancyId, title, lessonsJson = [] } = body

    if (!vacancyId || !title) {
      return NextResponse.json({ error: "vacancyId и title обязательны" }, { status: 400 })
    }

    // Проверяем, что вакансия принадлежит компании
    const [vacancy] = await db
      .select({ id: vacancies.id })
      .from(vacancies)
      .where(and(eq(vacancies.id, vacancyId), eq(vacancies.companyId, companyId)))
      .limit(1)

    if (!vacancy) return NextResponse.json({ error: "Вакансия не найдена" }, { status: 404 })

    const [row] = await db
      .insert(demos)
      .values({ vacancyId, title, lessonsJson, status: "draft" })
      .returning()

    return NextResponse.json(row, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}
