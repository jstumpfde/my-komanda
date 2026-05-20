// GET /api/modules/hr/vacancies/[id]/candidate-stats
//
// Сводные счётчики для шапки страницы вакансии. ОТДЕЛЬНЫЙ endpoint от
// /api/modules/hr/candidates, чтобы цифры в шапке не зависели от текущих
// фильтров пользователя (раньше «всего кандидатов» бралось из apiCandidates,
// и любой клиентский/серверный фильтр сразу искажал цифру — Юрий видел 0
// при 275 в БД).
//
// Возвращает:
//   total           — все кандидаты по vacancy_id (без фильтров)
//   pending         — hh_responses со status='response' (для кнопки «Разобрать»)
//   awaitingReview  — candidates.stage='anketa_filled' (ждут решения HR, см. P0-8)
//   demoOpened      — кандидаты с непустым demo_progress_json
//   rejected        — кандидаты в стадии 'rejected'
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { candidates, vacancies, hhResponses } from "@/lib/db/schema"
import { and, count, eq, isNotNull } from "drizzle-orm"

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { id: vacancyId } = await ctx.params

  const [vac] = await db
    .select({ companyId: vacancies.companyId, hhVacancyId: vacancies.hhVacancyId })
    .from(vacancies)
    .where(eq(vacancies.id, vacancyId))
    .limit(1)
  if (!vac) return NextResponse.json({ error: "vacancy not found" }, { status: 404 })

  // Доступ — только своя компания (или платформа). Здесь упрощённо: проверяем
  // принадлежность через session.user.companyId. Платформенным ролям доступ
  // оставляем (admin-вьюхи), HR-ролям — только своя companyId.
  const userRole = (session.user as { role?: string }).role
  const userCompanyId = (session.user as { companyId?: string }).companyId
  const isPlatform = userRole === "platform_admin" || userRole === "platform_manager"
  if (!isPlatform && userCompanyId && userCompanyId !== vac.companyId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  // 4 параллельных COUNT — drizzle делает каждый отдельным SELECT, но они
  // дешёвые (индекс по vacancy_id есть, см. drizzle/0081).
  const [
    [totalRow],
    [demoOpenedRow],
    [rejectedRow],
    [pendingRow],
    [awaitingReviewRow],
  ] = await Promise.all([
    db.select({ c: count() }).from(candidates).where(eq(candidates.vacancyId, vacancyId)),
    db.select({ c: count() }).from(candidates).where(and(
      eq(candidates.vacancyId, vacancyId),
      isNotNull(candidates.demoProgressJson),
    )),
    db.select({ c: count() }).from(candidates).where(and(
      eq(candidates.vacancyId, vacancyId),
      eq(candidates.stage, "rejected"),
    )),
    vac.hhVacancyId
      ? db.select({ c: count() }).from(hhResponses).where(and(
          eq(hhResponses.hhVacancyId, vac.hhVacancyId),
          eq(hhResponses.status, "response"),
        ))
      : Promise.resolve([{ c: 0 }]),
    // P0-8: реальное «ждут разбора HR» — это кандидаты с заполненной
    // финальной анкетой, ожидающие решения. Раньше шапка показывала
    // pending (hh-разбор) под этим лейблом, что вводило HR в заблуждение
    // («0 ждут разбора» при 175 anketa_filled).
    db.select({ c: count() }).from(candidates).where(and(
      eq(candidates.vacancyId, vacancyId),
      eq(candidates.stage, "anketa_filled"),
    )),
  ])

  return NextResponse.json({
    total:           totalRow?.c ?? 0,
    pending:         pendingRow?.c ?? 0,
    awaitingReview:  awaitingReviewRow?.c ?? 0,
    demoOpened:      demoOpenedRow?.c ?? 0,
    rejected:        rejectedRow?.c ?? 0,
  })
}
