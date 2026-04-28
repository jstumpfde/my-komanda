import { NextRequest, NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { vacancies, hhResponses } from "@/lib/db/schema"
import { and, eq, sql } from "drizzle-orm"

export async function GET(
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
      return NextResponse.json({
        hhVacancyId: null,
        totalResponses: 0,
        newResponses: 0,
        lastSyncAt: null,
      })
    }

    const [counts] = await db
      .select({
        total: sql<number>`count(*)::int`,
        unprocessed: sql<number>`count(*) filter (where ${hhResponses.status} = 'response')::int`,
        lastCreatedAt: sql<Date | null>`max(${hhResponses.createdAt})`,
      })
      .from(hhResponses)
      .where(and(
        eq(hhResponses.companyId, user.companyId),
        eq(hhResponses.hhVacancyId, vac.hhVacancyId),
      ))

    const lastResponseAt = counts?.lastCreatedAt ? new Date(counts.lastCreatedAt) : null
    const updatedAt = vac.updatedAt ? new Date(vac.updatedAt) : null
    const lastSyncAt = [lastResponseAt, updatedAt]
      .filter((d): d is Date => d !== null)
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null

    return NextResponse.json({
      hhVacancyId: vac.hhVacancyId,
      totalResponses: counts?.total ?? 0,
      newResponses: counts?.unprocessed ?? 0,
      lastSyncAt: lastSyncAt ? lastSyncAt.toISOString() : null,
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[HH stats]", err)
    return NextResponse.json({ error: "Ошибка загрузки метрик" }, { status: 500 })
  }
}
