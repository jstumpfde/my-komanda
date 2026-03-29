import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { candidates, vacancies } from "@/lib/db/schema"
import { eq, and, count, sql } from "drizzle-orm"

const STAGES = [
  { key: "new",         label: "Новый",              color: "#94a3b8" },
  { key: "demo",        label: "Демо пройдено",      color: "#3b82f6" },
  { key: "scheduled",   label: "Интервью назначено",  color: "#8b5cf6" },
  { key: "interviewed", label: "Интервью пройдено",   color: "#f59e0b" },
  { key: "hired",       label: "Нанят",              color: "#10b981" },
  { key: "rejected",    label: "Отказ",              color: "#ef4444" },
]

// GET /api/modules/hr/funnel?vacancyId=xxx (optional filter)
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(req.url)
  const vacancyId = url.searchParams.get("vacancyId")

  // Get all vacancies for dropdown
  const allVacancies = await db
    .select({ id: vacancies.id, title: vacancies.title, status: vacancies.status })
    .from(vacancies)
    .where(eq(vacancies.companyId, session.user.companyId))
    .orderBy(vacancies.createdAt)

  // Count candidates by stage
  const stageCounts = await db
    .select({
      stage: candidates.stage,
      cnt: count(),
    })
    .from(candidates)
    .innerJoin(vacancies, eq(vacancies.id, candidates.vacancyId))
    .where(and(
      eq(vacancies.companyId, session.user.companyId),
      vacancyId ? eq(candidates.vacancyId, vacancyId) : undefined,
    ))
    .groupBy(candidates.stage)

  const stageMap: Record<string, number> = {}
  stageCounts.forEach(s => { stageMap[s.stage ?? "new"] = Number(s.cnt) })

  // Build funnel data with conversion rates
  const funnel = STAGES.filter(s => s.key !== "rejected").map((stage, i, arr) => {
    const value = stageMap[stage.key] ?? 0
    const prevValue = i > 0 ? (stageMap[arr[i - 1].key] ?? 0) : value
    const conversion = prevValue > 0 ? Math.round((value / prevValue) * 100) : 0
    return {
      ...stage,
      value,
      conversion: i === 0 ? 100 : conversion,
    }
  })

  // Source breakdown
  const sources = await db
    .select({
      source: candidates.source,
      cnt: count(),
    })
    .from(candidates)
    .innerJoin(vacancies, eq(vacancies.id, candidates.vacancyId))
    .where(and(
      eq(vacancies.companyId, session.user.companyId),
      vacancyId ? eq(candidates.vacancyId, vacancyId) : undefined,
    ))
    .groupBy(candidates.source)

  const total = Object.values(stageMap).reduce((a, b) => a + b, 0)
  const hired = stageMap["hired"] ?? 0
  const rejected = stageMap["rejected"] ?? 0

  return NextResponse.json({
    funnel,
    sources: sources.map(s => ({ source: s.source ?? "unknown", count: Number(s.cnt) })),
    vacancies: allVacancies,
    summary: {
      total,
      hired,
      rejected,
      conversionRate: total > 0 ? Math.round((hired / total) * 100) : 0,
      avgTimeToHire: 14, // placeholder — нужна реальная дата
    },
  })
}
