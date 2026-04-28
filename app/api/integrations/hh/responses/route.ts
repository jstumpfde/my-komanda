import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { hhIntegrations, hhResponses, vacancies } from "@/lib/db/schema"
import { and, eq, isNull } from "drizzle-orm"
import { getValidToken } from "@/lib/hh-helpers"
import { getNegotiations, type HHNegotiationItem } from "@/lib/hh-api"

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

    const allItems: HHNegotiationItem[] = []
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
        const data = await getNegotiations(accessToken, { vacancyId: v.hhVacancyId }) as unknown
        // Defensive resolution: hh API формат может отличаться (items / collection / голый массив).
        // Пустой список — это не ошибка, а просто 0 откликов.
        const r = data as { items?: unknown; collection?: unknown } | unknown[] | null | undefined
        const items: HHNegotiationItem[] = Array.isArray((r as { items?: unknown })?.items)
          ? ((r as { items: HHNegotiationItem[] }).items)
          : Array.isArray((r as { collection?: unknown })?.collection)
            ? ((r as { collection: HHNegotiationItem[] }).collection)
            : Array.isArray(r)
              ? (r as HHNegotiationItem[])
              : []
        if (items.length === 0) {
          console.info(`[hh/responses] vacancy ${v.id} (hh ${v.hhVacancyId}): 0 откликов`)
        }
        allItems.push(...items)
      } catch (err) {
        console.error(`[hh/responses] vacancy ${v.id} (hh ${v.hhVacancyId}) failed:`, err instanceof Error ? err.message : err)
      }
    }

    for (const item of allItems) {
      const candidateName = [
        item.resume?.last_name,
        item.resume?.first_name,
        item.resume?.middle_name,
      ].filter(Boolean).join(" ") || null

      const values = {
        companyId,
        hhVacancyId: item.vacancy.id,
        hhResponseId: item.id,
        candidateName,
        candidatePhone: item.phone ?? null,
        candidateEmail: item.email ?? null,
        resumeTitle: item.resume?.title ?? null,
        resumeUrl: item.resume?.alternate_url ?? null,
        status: item.state.id,
        rawData: item as unknown as Record<string, unknown>,
        syncedAt: new Date(),
      }

      await db
        .insert(hhResponses)
        .values(values)
        .onConflictDoUpdate({
          target: [hhResponses.companyId, hhResponses.hhResponseId],
          set: values,
        })
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
