// POST /api/modules/hr/vacancies/[id]/mark-seen (P0-9)
//
// UPSERT'ит (user_id, vacancy_id) → NOW() в user_vacancy_views.
// Вызывается fire-and-forget из шапки страницы вакансии при mount.
// Используется для расчёта дельты «свежих» кандидатов (см.
// candidate-stats.freshCount и awaiting-review).

import { NextResponse } from "next/server"
import { eq, sql } from "drizzle-orm"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { userVacancyViews, vacancies } from "@/lib/db/schema"

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const { id: vacancyId } = await ctx.params

  // Проверяем существование и принадлежность вакансии к компании HR.
  // Платформенным ролям доступ оставляем — их «свежесть» тоже имеет смысл
  // (например, при ревью клиентских вакансий).
  const [vac] = await db
    .select({ companyId: vacancies.companyId })
    .from(vacancies)
    .where(eq(vacancies.id, vacancyId))
    .limit(1)
  if (!vac) return NextResponse.json({ error: "not found" }, { status: 404 })

  const userRole = (session.user as { role?: string }).role
  const userCompanyId = (session.user as { companyId?: string }).companyId
  const isPlatform = userRole === "platform_admin" || userRole === "platform_manager"
  if (!isPlatform && (!userCompanyId || userCompanyId !== vac.companyId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  await db
    .insert(userVacancyViews)
    .values({ userId: session.user.id, vacancyId })
    .onConflictDoUpdate({
      target: [userVacancyViews.userId, userVacancyViews.vacancyId],
      set: { lastSeenAt: sql`NOW()` },
    })

  return NextResponse.json({ ok: true })
}
