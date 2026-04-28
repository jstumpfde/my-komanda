import { NextRequest, NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { vacancies, hhVacancies } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCompany()
    const { id: localVacancyId } = await ctx.params

    const [vac] = await db
      .select()
      .from(vacancies)
      .where(and(
        eq(vacancies.id, localVacancyId),
        eq(vacancies.companyId, user.companyId),
      ))
      .limit(1)

    if (!vac) {
      return NextResponse.json({ error: "Вакансия не найдена" }, { status: 404 })
    }

    if (!vac.hhVacancyId) {
      return NextResponse.json({ ok: true, alreadyUnlinked: true })
    }

    const previousHhVacancyId = vac.hhVacancyId

    await db
      .update(vacancies)
      .set({ hhVacancyId: null, hhUrl: null, hhSyncedAt: null, updatedAt: new Date() })
      .where(eq(vacancies.id, localVacancyId))

    await db
      .update(hhVacancies)
      .set({ localVacancyId: null })
      .where(and(
        eq(hhVacancies.companyId, user.companyId),
        eq(hhVacancies.hhVacancyId, previousHhVacancyId),
      ))

    return NextResponse.json({ ok: true, previousHhVacancyId })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[HH unlink]", err)
    return NextResponse.json({ error: "Ошибка отвязки вакансии" }, { status: 500 })
  }
}
