import { NextRequest } from "next/server"
import { eq, and, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies, followUpMessages, followUpCampaigns, candidates, hhResponses } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { renderTemplate } from "@/lib/template-renderer"
import { resolveGivenNameMeta } from "@/lib/messaging/candidate-name"

// Ревизия очереди исходящих: список отложенных дожимов с превью текста (имя уже
// подставлено), что hh отдал как имя/фамилию, флаг «проверить» и действия.
//
// GET  — список pending-сообщений вакансии (кандидат, имя, источник, превью, время)
// POST — { action: 'cancel', messageId } | { action: 'rename', candidateId, firstName }

const MAX_ITEMS = 500

async function getVacancy(id: string, companyId: string) {
  const [v] = await db
    .select({ id: vacancies.id, title: vacancies.title })
    .from(vacancies)
    .where(and(eq(vacancies.id, id), eq(vacancies.companyId, companyId)))
    .limit(1)
  return v ?? null
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params
    const vac = await getVacancy(id, user.companyId)
    if (!vac) return apiError("Вакансия не найдена", 404)

    const campaignRows = await db
      .select({ id: followUpCampaigns.id })
      .from(followUpCampaigns)
      .where(eq(followUpCampaigns.vacancyId, id))
    const campaignIds = campaignRows.map((c) => c.id)
    if (campaignIds.length === 0) return apiSuccess({ items: [], total: 0, needsCheck: 0 })

    const msgs = await db
      .select({
        id:          followUpMessages.id,
        candidateId: followUpMessages.candidateId,
        messageText: followUpMessages.messageText,
        scheduledAt: followUpMessages.scheduledAt,
        branch:      followUpMessages.branch,
        touchNumber: followUpMessages.touchNumber,
      })
      .from(followUpMessages)
      .where(and(
        eq(followUpMessages.status, "pending"),
        inArray(followUpMessages.campaignId, campaignIds),
      ))
      .orderBy(followUpMessages.scheduledAt)
      .limit(MAX_ITEMS)

    if (msgs.length === 0) return apiSuccess({ items: [], total: 0, needsCheck: 0 })

    const candidateIds = [...new Set(msgs.map((m) => m.candidateId))]

    // Кандидаты одним запросом
    const candRows = await db
      .select({
        id:    candidates.id,
        name:  candidates.name,
        shortId: candidates.shortId,
        token: candidates.token,
        firstNameOverride: candidates.firstNameOverride,
      })
      .from(candidates)
      .where(inArray(candidates.id, candidateIds))
    const candMap = new Map(candRows.map((c) => [c.id, c]))

    // hh first/last одним запросом (первый отклик на кандидата)
    const hhRows = await db
      .select({ candidateId: hhResponses.localCandidateId, raw: hhResponses.rawData })
      .from(hhResponses)
      .where(inArray(hhResponses.localCandidateId, candidateIds))
    const hhMap = new Map<string, { first: string | null; last: string | null }>()
    for (const h of hhRows) {
      if (!h.candidateId || hhMap.has(h.candidateId)) continue
      const resume = (h.raw as { resume?: { first_name?: unknown; last_name?: unknown } } | null)?.resume
      const first = typeof resume?.first_name === "string" ? resume.first_name.trim() : null
      const last  = typeof resume?.last_name === "string" ? resume.last_name.trim() : null
      hhMap.set(h.candidateId, { first, last })
    }

    let needsCheck = 0
    const items = msgs.map((m) => {
      const cand = candMap.get(m.candidateId)
      const hh = hhMap.get(m.candidateId)
      const meta = resolveGivenNameMeta({
        override: cand?.firstNameOverride,
        hhFirst:  hh?.first,
        hhLast:   hh?.last,
        fullName: cand?.name,
      })
      if (!meta.confident) needsCheck++

      const slug = cand?.shortId ?? cand?.token ?? m.candidateId
      const preview = renderTemplate(m.messageText, {
        name:          meta.firstName,
        vacancy:       vac.title || "",
        company:       "Company24",
        demo_link:     `https://company24.pro/demo/${slug}`,
        test_link:     `https://company24.pro/test/${slug}`,
        schedule_link: `https://company24.pro/schedule/${slug}`,
      })

      return {
        messageId:    m.id,
        candidateId:  m.candidateId,
        candidateName: cand?.name ?? "—",
        hhFirst:      hh?.first ?? null,
        hhLast:       hh?.last ?? null,
        override:     cand?.firstNameOverride ?? null,
        resolvedName: meta.firstName,
        nameSource:   meta.source,
        needsCheck:   !meta.confident,
        scheduledAt:  m.scheduledAt,
        branch:       m.branch,
        touchNumber:  m.touchNumber,
        preview,
      }
    })

    return apiSuccess({ items, total: items.length, needsCheck })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[message-queue/items GET]", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params
    const vac = await getVacancy(id, user.companyId)
    if (!vac) return apiError("Вакансия не найдена", 404)

    const body = (await req.json().catch(() => ({}))) as {
      action?: string; messageId?: string; candidateId?: string; firstName?: string
    }

    // Множество campaignId вакансии — для tenant-проверки сообщений
    const campaignRows = await db
      .select({ id: followUpCampaigns.id })
      .from(followUpCampaigns)
      .where(eq(followUpCampaigns.vacancyId, id))
    const campaignIds = campaignRows.map((c) => c.id)

    if (body.action === "cancel") {
      if (!body.messageId) return apiError("messageId обязателен", 400)
      if (campaignIds.length === 0) return apiError("Сообщение не найдено", 404)
      // Отменяем только если сообщение принадлежит кампании этой вакансии и ещё pending
      const res = await db
        .update(followUpMessages)
        .set({ status: "cancelled", errorMessage: "cancelled_by_hr_review" })
        .where(and(
          eq(followUpMessages.id, body.messageId),
          eq(followUpMessages.status, "pending"),
          inArray(followUpMessages.campaignId, campaignIds),
        ))
        .returning({ id: followUpMessages.id })
      if (res.length === 0) return apiError("Сообщение не найдено или уже обработано", 404)
      return apiSuccess({ cancelled: body.messageId })
    }

    if (body.action === "rename") {
      if (!body.candidateId) return apiError("candidateId обязателен", 400)
      // Кандидат принадлежит этой вакансии (она уже проверена на компанию)
      const newName = (body.firstName ?? "").trim()
      const res = await db
        .update(candidates)
        .set({ firstNameOverride: newName || null })
        .where(and(eq(candidates.id, body.candidateId), eq(candidates.vacancyId, id)))
        .returning({ id: candidates.id })
      if (res.length === 0) return apiError("Кандидат не найден", 404)
      return apiSuccess({ candidateId: body.candidateId, firstNameOverride: newName || null })
    }

    return apiError("Неизвестное действие", 400)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[message-queue/items POST]", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
