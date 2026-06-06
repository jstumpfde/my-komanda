import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { hhIntegrations, hhResponses, vacancies } from "@/lib/db/schema"
import { and, eq, isNull } from "drizzle-orm"
import { getValidToken } from "@/lib/hh-helpers"
import { importHhResponsesForVacancy } from "@/lib/hh/import-responses"

export async function GET() {
  const session = await auth()
  if (!session?.user?.companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const companyId = session.user.companyId
  const tokenResult = await getValidToken(companyId)

  if (!tokenResult) {
    const cached = await db
      .select()
      .from(hhResponses)
      .where(eq(hhResponses.companyId, companyId))

    return NextResponse.json({ responses: cached, fromCache: true })
  }

  try {
    const { accessToken, integration } = tokenResult

    // HH API /negotiations требует vacancy_id (integer). Берём его из локальных вакансий
    // компании. UUID наших vacancies.id для hh API не годится — нужен hh_vacancy_id.
    const localVacs = await db
      .select({ id: vacancies.id, hhVacancyId: vacancies.hhVacancyId })
      .from(vacancies)
      .where(and(eq(vacancies.companyId, companyId), isNull(vacancies.deletedAt)))

    // Импорт делегирован в общий lib/hh/import-responses (тот же модуль, что и
    // у cron'а — чтобы пути не расходились). mode "sync": обрабатываем все
    // отклики и подтягиваем полное резюме на каждый, как и раньше.
    for (const v of localVacs) {
      if (!v.hhVacancyId) {
        console.warn(`[hh/responses] skip vacancy ${v.id} — нет hh_vacancy_id`)
        continue
      }
      if (!/^\d+$/.test(v.hhVacancyId)) {
        console.warn(`[hh/responses] skip vacancy ${v.id} — hh_vacancy_id не integer: "${v.hhVacancyId}"`)
        continue
      }
      try {
        await importHhResponsesForVacancy({
          companyId,
          accessToken,
          hhVacancyId: v.hhVacancyId,
          mode: "sync",
        })
      } catch (err) {
        console.error(`[hh/responses] vacancy ${v.id} (hh ${v.hhVacancyId}) failed:`, err instanceof Error ? err.message : err)
      }
    }

    await db
      .update(hhIntegrations)
      .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
      .where(eq(hhIntegrations.id, integration.id))

    const responses = await db
      .select()
      .from(hhResponses)
      .where(eq(hhResponses.companyId, companyId))

    return NextResponse.json({ responses, fromCache: false })
  } catch (err) {
    console.error("[hh/responses]", err)

    const cached = await db
      .select()
      .from(hhResponses)
      .where(eq(hhResponses.companyId, companyId))

    return NextResponse.json({ responses: cached, fromCache: true, error: "sync_failed" })
  }
}
