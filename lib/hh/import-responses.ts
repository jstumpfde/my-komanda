import { db } from "@/lib/db"
import { hhResponses } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { getNegotiations, fetchHhResume, type HHNegotiationItem } from "@/lib/hh-api"

// Единый импорт hh-откликов в таблицу hh_responses. ОДИН источник правды для
// двух вызывающих сторон:
//   • кнопка «Синхронизировать» — GET /api/integrations/hh/responses (mode "sync")
//   • cron /api/cron/hh-import (mode "new")
// Раньше cron импортировал через HHClient.importApplications, который писал
// НАПРЯМУЮ в candidates (минуя hh_responses) — поэтому processHhQueue, который
// читает hh_responses, не видел новых откликов. Теперь оба пути пишут в
// hh_responses одинаково, и расхождение устранено.
//
// mode:
//   "sync" — обрабатываем ВСЕ items (upsert + подтягиваем полное резюме на
//            каждый). Поведение кнопки «Синхронизировать» без изменений.
//   "new"  — пропускаем уже импортированные hh_response_id; полное резюме
//            (/resumes/{id}, лимит hh ~200/час) тянем только для новых. Для
//            рекуррентного cron'а раз в N минут это не выжигает rate-limit и
//            не перезатирает уже сохранённое полное резюме preview-данными.

const RESUME_FETCH_DELAY_MS = 200
const DEFAULT_MAX_PAGES = 20

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// hh может вернуть отклики как { items } / { collection } / голый массив.
function resolveItems(r: unknown): HHNegotiationItem[] {
  return Array.isArray((r as { items?: unknown })?.items)
    ? ((r as { items: HHNegotiationItem[] }).items)
    : Array.isArray((r as { collection?: unknown })?.collection)
      ? ((r as { collection: HHNegotiationItem[] }).collection)
      : Array.isArray(r)
        ? (r as HHNegotiationItem[])
        : []
}

export interface ImportHhResponsesResult {
  /** Сколько откликов реально записано/обновлено в hh_responses. */
  imported: number
  /** found из hh API (приблизительно «активных» откликов по вакансии). */
  found: number | null
  /** Сколько items вернул hh (по всем страницам). */
  fetched: number
}

export async function importHhResponsesForVacancy(opts: {
  companyId: string
  accessToken: string
  hhVacancyId: string
  mode?: "sync" | "new"
  maxPages?: number
}): Promise<ImportHhResponsesResult> {
  const { companyId, accessToken, hhVacancyId } = opts
  const mode = opts.mode ?? "sync"
  const maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES

  // ── 1. Тянем страницы откликов ──────────────────────────────────────────
  const allItems: HHNegotiationItem[] = []
  const firstResp = (await getNegotiations(accessToken, { vacancyId: hhVacancyId, page: 0 })) as unknown
  allItems.push(...resolveItems(firstResp))

  const pages = (firstResp as { pages?: number })?.pages ?? 1
  const found = (firstResp as { found?: number })?.found ?? null
  const totalPages = Math.min(pages, maxPages)
  console.log(
    `[hh-import-responses] vacancy=${hhVacancyId} mode=${mode} found=${found ?? 0} pages=${pages} (capped=${totalPages})`,
  )

  for (let page = 1; page < totalPages; page++) {
    const data = await getNegotiations(accessToken, { vacancyId: hhVacancyId, page })
    allItems.push(...resolveItems(data))
  }

  // hh при фильтре по vacancy_id не кладёт vacancy на каждый item —
  // восстанавливаем привязку из контекста.
  const itemsWithVacancy: HHNegotiationItem[] = allItems.map((item) =>
    item.vacancy?.id ? item : { ...item, vacancy: { id: hhVacancyId, name: item.vacancy?.name ?? "" } },
  )

  // ── 2. В режиме "new" — пропускаем уже импортированные ───────────────────
  let existingIds: Set<string> | null = null
  if (mode === "new") {
    const existing = await db
      .select({ hhResponseId: hhResponses.hhResponseId })
      .from(hhResponses)
      .where(and(eq(hhResponses.companyId, companyId), eq(hhResponses.hhVacancyId, hhVacancyId)))
    existingIds = new Set(existing.map((e) => e.hhResponseId))
  }

  // ── 3. Upsert ────────────────────────────────────────────────────────────
  let imported = 0
  for (let idx = 0; idx < itemsWithVacancy.length; idx++) {
    const item = itemsWithVacancy[idx]
    if (!item?.vacancy?.id || !item?.id) {
      console.warn("[hh-import-responses] skip item — missing vacancy.id or item.id")
      continue
    }
    // "new": уже импортированный отклик не трогаем (не жжём /resumes и не
    // перезатираем сохранённое полное резюме). Его статус/разбор ведёт
    // processHhQueue по localCandidateId.
    if (existingIds && existingIds.has(item.id)) continue

    const candidateName = [
      item.resume?.last_name,
      item.resume?.first_name,
      item.resume?.middle_name,
    ].filter(Boolean).join(" ") || null

    const resumePreview = (item.resume ?? null) as Record<string, unknown> | null
    const resumeId = item.resume?.id ?? null

    let mergedResume: Record<string, unknown> | null = resumePreview
    if (resumeId) {
      const full = await fetchHhResume(accessToken, resumeId)
      if (full) {
        mergedResume = { ...(resumePreview ?? {}), ...full }
      }
      if (idx < itemsWithVacancy.length - 1) await sleep(RESUME_FETCH_DELAY_MS)
    }

    const itemRaw = item as unknown as Record<string, unknown>
    const rawData: Record<string, unknown> = mergedResume ? { ...itemRaw, resume: mergedResume } : itemRaw

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
        // localCandidateId НЕ в values → при апдейте сохраняется привязка
        // кандидата (guard от повторного разбора в processHhQueue).
        set: values,
      })
    imported++
  }

  return { imported, found, fetched: itemsWithVacancy.length }
}
