// GET /api/modules/hr/vacancies/[id]/stats
//
// #13/#14: единый endpoint статистики вакансии. Возвращает структуру
// VacancyStats из lib/vacancy-stats.ts. Используется шапкой страницы
// вакансии и табом «Аналитика». Старый /candidate-stats возвращает
// подмножество для совместимости.

import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { getVacancyStats } from "@/lib/vacancy-stats"

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { id: vacancyId } = await ctx.params

  const [vac] = await db
    .select({ companyId: vacancies.companyId })
    .from(vacancies)
    .where(eq(vacancies.id, vacancyId))
    .limit(1)
  if (!vac) return NextResponse.json({ error: "vacancy not found" }, { status: 404 })

  const userRole = (session.user as { role?: string }).role
  const userCompanyId = (session.user as { companyId?: string }).companyId
  const isPlatform = userRole === "platform_admin" || userRole === "platform_manager"
  if (!isPlatform && userCompanyId && userCompanyId !== vac.companyId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const stats = await getVacancyStats(vacancyId)
  return NextResponse.json(stats)
}
