import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { hhIntegrations, hhResponses, vacancies } from "@/lib/db/schema"
import { and, eq, isNull } from "drizzle-orm"
import { getValidToken } from "@/lib/hh-helpers"
import { getNegotiations, fetchHhResume, type HHNegotiationItem } from "@/lib/hh-api"

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// Пауза между запросами /resumes/{id} — hh лимитирует ~200 запросов/час с токена.
// 200мс даёт ~5 rps, что заведомо безопасно даже при пиковых батчах.
const RESUME_FETCH_DELAY_MS = 200

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

    for (let idx = 0; idx < allItems.length; idx++) {
      const item = allItems[idx]
      // Защитная проверка: hh иногда отдаёт item без vacancy/id — пропускаем,
      // иначе падает весь батч на TypeError "Cannot read properties of undefined".
      if (!item?.vacancy?.id || !item?.id) {
        console.warn("[hh/responses] skip item — missing vacancy.id or item.id")
        continue
      }

      const candidateName = [
        item.resume?.last_name,
        item.resume?.first_name,
        item.resume?.middle_name,
      ].filter(Boolean).join(" ") || null

      // Полное резюме (/resumes/{id}) — содержит контакты, языки, навыки,
      // портфолио, релокацию и т.д. Если получили — заменяем preview-резюме
      // полным; preview-поля (first_name/last_name/title/photo) присутствуют
      // в обоих форматах, поэтому замена безопасна. Если резюме приватное (403)
      // или удалено (404) — fetchHhResume вернёт null, оставляем preview как было.
      const resumePreview = (item.resume ?? null) as Record<string, unknown> | null
      const resumeId = item.resume?.id ?? null

      let mergedResume: Record<string, unknown> | null = resumePreview
      if (resumeId) {
        const full = await fetchHhResume(accessToken, resumeId)
        if (full) {
          // Полные данные приоритетны, но preview-поля сохраняем как fallback
          // на случай если hh в /resumes пропустит какое-то поле, что было в /negotiations.
          mergedResume = { ...(resumePreview ?? {}), ...full }
        }
        // Пауза между resume-запросами — защита от rate limit hh (200/час).
        if (idx < allItems.length - 1) await sleep(RESUME_FETCH_DELAY_MS)
      }

      const itemRaw = item as unknown as Record<string, unknown>
      const rawData: Record<string, unknown> = mergedResume
        ? { ...itemRaw, resume: mergedResume }
        : itemRaw

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
        rawData,
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
