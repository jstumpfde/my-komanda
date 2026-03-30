/**
 * GET /api/modules/hr/funnel-v2
 * Агрегированная аналитика воронки найма.
 */
import { NextResponse } from "next/server"
import { eq, and, count, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies } from "@/lib/db/schema"
import { requireCompany } from "@/lib/api-helpers"

const STAGES = ["new", "screening", "demo", "interview", "offer", "hired", "rejected"] as const

export async function GET() {
  try {
    const { companyId } = await requireCompany()

    // Считаем кандидатов по стадиям
    const stageCounts = await db
      .select({
        stage: candidates.stage,
        total: count(),
      })
      .from(candidates)
      .innerJoin(vacancies, eq(vacancies.id, candidates.vacancyId))
      .where(eq(vacancies.companyId, companyId))
      .groupBy(candidates.stage)

    const byStage: Record<string, number> = {}
    for (const { stage, total } of stageCounts) {
      if (stage) byStage[stage] = total
    }

    // Считаем по источникам
    const sourceCounts = await db
      .select({
        source: candidates.source,
        total: count(),
      })
      .from(candidates)
      .innerJoin(vacancies, eq(vacancies.id, candidates.vacancyId))
      .where(eq(vacancies.companyId, companyId))
      .groupBy(candidates.source)

    // Считаем кандидатов по вакансиям
    const vacancyCounts = await db
      .select({
        vacancyId: vacancies.id,
        vacancyTitle: vacancies.title,
        total: count(),
      })
      .from(candidates)
      .innerJoin(vacancies, eq(vacancies.id, candidates.vacancyId))
      .where(eq(vacancies.companyId, companyId))
      .groupBy(vacancies.id, vacancies.title)
      .orderBy(sql`count(*) desc`)
      .limit(10)

    // Воронка с конверсией
    const funnel = STAGES.map((stage, i) => {
      const count = byStage[stage] ?? 0
      const prev = i > 0 ? (byStage[STAGES[i - 1]] ?? 0) : 0
      const conversion = prev > 0 ? Math.round((count / prev) * 100) : null
      return { stage, count, conversion }
    })

    const total = Object.values(byStage).reduce((a, b) => a + b, 0)
    const hired = byStage["hired"] ?? 0
    const conversionRate = total > 0 ? Math.round((hired / total) * 100 * 10) / 10 : 0

    return NextResponse.json({
      funnel,
      bySource: sourceCounts.map((r) => ({ source: r.source ?? "unknown", count: r.total })),
      byVacancy: vacancyCounts,
      summary: { total, hired, conversionRate },
    })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}
