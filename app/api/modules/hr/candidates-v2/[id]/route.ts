/**
 * GET    /api/modules/hr/candidates-v2/[id]
 * PUT    /api/modules/hr/candidates-v2/[id]  — обновить stage/score/notes
 * DELETE /api/modules/hr/candidates-v2/[id]
 */
import { NextRequest, NextResponse } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies } from "@/lib/db/schema"
import { requireCompany } from "@/lib/api-helpers"

// Проверяем, что кандидат принадлежит компании
async function checkOwnership(companyId: string, candidateId: string) {
  const [row] = await db
    .select({ id: candidates.id })
    .from(candidates)
    .innerJoin(vacancies, eq(vacancies.id, candidates.vacancyId))
    .where(and(eq(candidates.id, candidateId), eq(vacancies.companyId, companyId)))
    .limit(1)
  return !!row
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { companyId } = await requireCompany()
    const { id } = await params

    const [row] = await db
      .select({
        id: candidates.id,
        name: candidates.name,
        email: candidates.email,
        phone: candidates.phone,
        city: candidates.city,
        source: candidates.source,
        stage: candidates.stage,
        score: candidates.score,
        token: candidates.token,
        experience: candidates.experience,
        skills: candidates.skills,
        vacancyId: candidates.vacancyId,
        vacancyTitle: vacancies.title,
        demoProgressJson: candidates.demoProgressJson,
        createdAt: candidates.createdAt,
      })
      .from(candidates)
      .innerJoin(vacancies, eq(vacancies.id, candidates.vacancyId))
      .where(and(eq(candidates.id, id), eq(vacancies.companyId, companyId)))
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

    if (!(await checkOwnership(companyId, id))) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 })
    }

    const body = await req.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: Record<string, any> = { updatedAt: new Date() }
    if ("stage" in body)    update.stage    = body.stage
    if ("score" in body)    update.score    = body.score
    if ("source" in body)   update.source   = body.source

    const [row] = await db
      .update(candidates)
      .set(update)
      .where(eq(candidates.id, id))
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

    if (!(await checkOwnership(companyId, id))) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 })
    }

    await db.delete(candidates).where(eq(candidates.id, id))
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}
