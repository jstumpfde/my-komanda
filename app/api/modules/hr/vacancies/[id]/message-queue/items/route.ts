import { NextRequest } from "next/server"
import { eq, and, inArray, or, gte } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies, followUpMessages, followUpCampaigns, candidates, hhResponses } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { renderTemplate } from "@/lib/template-renderer"
import { resolveGivenNameMeta } from "@/lib/messaging/candidate-name"
import { canSendNow, adjustToWorkingWindow, type VacancySchedule } from "@/lib/schedule/can-send-now"

// Ревизия очереди исходящих: журнал касаний с превью текста (имя уже подставлено),
// что hh отдал как имя/фамилию, флаг «проверить», статус, «уйдёт в» и причину ожидания.
//
// GET  — журнал сообщений вакансии: все pending + недавние завершённые
//        (sent/cancelled/failed за последние DONE_WINDOW_DAYS дней).
//        На каждую строку: статус, scheduledAt, sentAt, причина ожидания (для pending).
// POST — { action: 'cancel', messageId }
//      | { action: 'cancel_batch', messageIds: string[] }
//      | { action: 'cancel_for_candidate', candidateId }
//      | { action: 'rename', candidateId, firstName }

const MAX_ITEMS = 500
// Завершённые (sent/cancelled/failed) показываем только за последнюю неделю —
// журнал не разрастается бесконечно, но недавнюю историю отправок видно.
const DONE_WINDOW_DAYS = 7

async function getVacancy(id: string, companyId: string) {
  const [v] = await db
    .select({
      id:                         vacancies.id,
      title:                      vacancies.title,
      scheduleEnabled:            vacancies.scheduleEnabled,
      scheduleStart:              vacancies.scheduleStart,
      scheduleEnd:                vacancies.scheduleEnd,
      scheduleTimezone:           vacancies.scheduleTimezone,
      scheduleWorkingDays:        vacancies.scheduleWorkingDays,
      scheduleExcludedHolidayIds: vacancies.scheduleExcludedHolidayIds,
      scheduleCustomHolidays:     vacancies.scheduleCustomHolidays,
      scheduleLunchEnabled:       vacancies.scheduleLunchEnabled,
      scheduleLunchFrom:          vacancies.scheduleLunchFrom,
      scheduleLunchTo:            vacancies.scheduleLunchTo,
      scheduleCountry:            vacancies.scheduleCountry,
    })
    .from(vacancies)
    .where(and(eq(vacancies.id, id), eq(vacancies.companyId, companyId)))
    .limit(1)
  return v ?? null
}

// «Уйдёт в» строкой HH:MM (МСК) — короткий формат для причины ожидания.
function fmtHHMM(iso: Date | string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow", hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso))
}

// Причина ожидания для pending-сообщения. Cron скип-ризоны в БД не хранятся —
// деривим из scheduled_at + окна работы вакансии (canSendNow/adjustToWorkingWindow):
//   • scheduled_at в будущем → «отложено до HH:MM» (ждём наступления времени)
//   • время пришло, но сейчас вне окна отправки → «вне окна отправки (до HH:MM)»
//   • иначе → «в очереди» (ближайший cron заберёт)
function deriveWaitingReason(
  scheduledAt: Date, now: Date, schedule: VacancySchedule,
): string {
  if (scheduledAt.getTime() > now.getTime()) {
    return `отложено до ${fmtHHMM(scheduledAt)}`
  }
  const check = canSendNow(schedule, now)
  if (!check.allowed) {
    // Ближайший разрешённый слот окна — до какого времени ждать.
    const { adjusted } = adjustToWorkingWindow(now, schedule)
    return `вне окна отправки (до ${fmtHHMM(adjusted)})`
  }
  return "в очереди"
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

    const now = new Date()
    const doneSince = new Date(now.getTime() - DONE_WINDOW_DAYS * 24 * 60 * 60 * 1000)

    // Журнал = все pending + завершённые за последнюю неделю. 'sending' (в полёте
    // у cron) показываем как «отправляется» — трактуем как pending-подобное.
    const msgs = await db
      .select({
        id:           followUpMessages.id,
        candidateId:  followUpMessages.candidateId,
        messageText:  followUpMessages.messageText,
        scheduledAt:  followUpMessages.scheduledAt,
        sentAt:       followUpMessages.sentAt,
        status:       followUpMessages.status,
        branch:       followUpMessages.branch,
        touchNumber:  followUpMessages.touchNumber,
      })
      .from(followUpMessages)
      .where(and(
        inArray(followUpMessages.campaignId, campaignIds),
        or(
          inArray(followUpMessages.status, ["pending", "sending"]),
          // Завершённые — только недавние (по sentAt для sent/failed, иначе scheduledAt).
          and(
            inArray(followUpMessages.status, ["sent", "cancelled", "failed"]),
            or(
              gte(followUpMessages.sentAt, doneSince),
              gte(followUpMessages.scheduledAt, doneSince),
            ),
          ),
        ),
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
      const isPending = m.status === "pending" || m.status === "sending"
      // «Проверить» имеет смысл только для ещё не ушедших — правка override
      // повлияет лишь на будущую отправку. По завершённым не считаем.
      if (isPending && !meta.confident) needsCheck++

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
        needsCheck:   isPending && !meta.confident,
        scheduledAt:  m.scheduledAt,
        sentAt:       m.sentAt,
        status:       m.status,
        // Причина ожидания — только для ещё-не-ушедших; по завершённым null.
        waitingReason: isPending ? deriveWaitingReason(m.scheduledAt, now, vac) : null,
        branch:       m.branch,
        touchNumber:  m.touchNumber,
        preview,
      }
    })

    // Порядок: сначала ещё-не-ушедшие (pending/sending) — ближайшие сверху
    // (asc по плановому времени), затем завершённые — самые свежие сверху
    // (desc по факту отправки / плановому времени). Так «что скоро уйдёт»
    // не тонет под историей.
    const isPend = (s: string) => s === "pending" || s === "sending"
    const whenMs = (it: { sentAt: unknown; scheduledAt: unknown }) =>
      new Date((it.sentAt ?? it.scheduledAt) as string | Date).getTime()
    items.sort((a, b) => {
      const ap = isPend(a.status), bp = isPend(b.status)
      if (ap !== bp) return ap ? -1 : 1
      if (ap) return whenMs(a) - whenMs(b)   // pending: ближайшие первыми
      return whenMs(b) - whenMs(a)           // завершённые: свежие первыми
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
      action?: string; messageId?: string; messageIds?: string[]; candidateId?: string; firstName?: string
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

    // Массовая отмена по списку id — один UPDATE, без N+1. Tenant-проверка
    // через inArray(campaignId) — отменятся только сообщения этой вакансии.
    if (body.action === "cancel_batch") {
      const ids = Array.isArray(body.messageIds) ? body.messageIds.filter((x) => typeof x === "string") : []
      if (ids.length === 0) return apiError("messageIds обязателен", 400)
      if (campaignIds.length === 0) return apiSuccess({ cancelled: [] as string[], count: 0 })
      const res = await db
        .update(followUpMessages)
        .set({ status: "cancelled", errorMessage: "cancelled_by_hr_review" })
        .where(and(
          inArray(followUpMessages.id, ids),
          eq(followUpMessages.status, "pending"),
          inArray(followUpMessages.campaignId, campaignIds),
        ))
        .returning({ id: followUpMessages.id })
      return apiSuccess({ cancelled: res.map((r) => r.id), count: res.length })
    }

    // Отмена всех pending-сообщений одного кандидата в рамках этой вакансии.
    if (body.action === "cancel_for_candidate") {
      if (!body.candidateId) return apiError("candidateId обязателен", 400)
      if (campaignIds.length === 0) return apiSuccess({ cancelled: [] as string[], count: 0 })
      const res = await db
        .update(followUpMessages)
        .set({ status: "cancelled", errorMessage: "cancelled_by_hr_review" })
        .where(and(
          eq(followUpMessages.candidateId, body.candidateId),
          eq(followUpMessages.status, "pending"),
          inArray(followUpMessages.campaignId, campaignIds),
        ))
        .returning({ id: followUpMessages.id })
      return apiSuccess({ cancelled: res.map((r) => r.id), count: res.length })
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
