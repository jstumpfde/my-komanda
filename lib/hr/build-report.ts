// Общая агрегация «Отчёта по найму». Используется и авторизованным API
// (/api/modules/hr/report), и публичным (/api/public/report/[token]).
// Принимает companyId (тенант) + опц. фильтры (период, конкретная вакансия).

import { eq, and, count, isNull, inArray, sql, gte, lte } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies, candidates, calendarEvents, candidateContacts } from "@/lib/db/schema"
import { ACTIVE_VACANCY_STATUSES } from "@/lib/vacancies/filters"
import { getVacancyLifecycle } from "@/lib/vacancies/lifecycle"
import { REJECTION_REASONS, REJECTION_INITIATORS, autoReasonKey, autoReasonLabel } from "@/lib/hr/rejection-reasons"
import { PLATFORM_STAGES, ALL_STAGE_SLUGS } from "@/lib/stages"
import { CONTACT_CHANNELS, CONTACT_OUTCOMES } from "@/lib/hr/contacts"

export type ReportPeriod =
  | "today" | "yesterday"
  | "this_week" | "last_week"
  | "this_month" | "last_month"
  | "all" | "custom"

const PERIOD_VALUES: ReportPeriod[] = [
  "today", "yesterday", "this_week", "last_week", "this_month", "last_month", "all", "custom",
]

export function parsePeriod(raw: string | null): ReportPeriod {
  return (PERIOD_VALUES as string[]).includes(raw ?? "") ? (raw as ReportPeriod) : "all"
}

function startOfDay(d: Date): Date { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
function endOfDay(d: Date): Date { const x = new Date(d); x.setHours(23, 59, 59, 999); return x }

// Понедельник как начало недели (ISO). 0=вс → откатываем на 6 дней.
function startOfWeek(d: Date): Date {
  const x = startOfDay(d)
  const day = x.getDay()
  const diff = (day === 0 ? 6 : day - 1)
  x.setDate(x.getDate() - diff)
  return x
}

function periodRange(period: ReportPeriod): { from: Date | null; to: Date | null } {
  if (period === "all" || period === "custom") return { from: null, to: null }

  const now = new Date()

  switch (period) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now) }
    case "yesterday": {
      const y = new Date(now); y.setDate(y.getDate() - 1)
      return { from: startOfDay(y), to: endOfDay(y) }
    }
    case "this_week":
      return { from: startOfWeek(now), to: endOfDay(now) }
    case "last_week": {
      const start = startOfWeek(now); start.setDate(start.getDate() - 7)
      const end = new Date(start); end.setDate(end.getDate() + 6)
      return { from: start, to: endOfDay(end) }
    }
    case "this_month":
      return { from: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)), to: endOfDay(now) }
    case "last_month": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const end = new Date(now.getFullYear(), now.getMonth(), 0) // последний день пред. месяца
      return { from: startOfDay(start), to: endOfDay(end) }
    }
    default:
      return { from: null, to: null }
  }
}

function dateFilter<T extends { createdAt: unknown }>(
  table: T,
  from: Date | null,
  to: Date | null,
) {
  const filters = []
  if (from) filters.push(gte(table.createdAt as Parameters<typeof gte>[0], from))
  if (to)   filters.push(lte(table.createdAt as Parameters<typeof lte>[0], to))
  return filters
}

export interface BuildReportOptions {
  period?: ReportPeriod
  vacancyId?: string | null
  /** Кастомный диапазон (с календаря) — перекрывает пресет периода. */
  from?: Date | null
  to?: Date | null
}

export async function buildReport(companyId: string, opts: BuildReportOptions = {}) {
  const vacancyId = opts.vacancyId && opts.vacancyId !== "all" ? opts.vacancyId : null

  // Кастомный диапазон с календаря перекрывает пресет.
  const hasCustom = !!(opts.from || opts.to)
  const period: ReportPeriod = hasCustom ? "custom" : (opts.period ?? "all")
  const { from, to } = hasCustom
    ? { from: opts.from ? startOfDay(opts.from) : null, to: opts.to ? endOfDay(opts.to) : null }
    : periodRange(period)

  const candidateDateFilters = dateFilter(candidates, from, to)
  const eventDateFilters = dateFilter(calendarEvents, from, to)
  const contactDateFilters = dateFilter(candidateContacts, from, to)

  // Фильтр по конкретной вакансии (когда выбрана в дропдауне).
  const vacancyFilter = vacancyId ? [eq(vacancies.id, vacancyId)] : []
  const eventVacancyFilter = vacancyId ? [eq(calendarEvents.vacancyId, vacancyId)] : []
  const contactVacancyFilter = vacancyId ? [eq(candidateContacts.vacancyId, vacancyId)] : []

  const [
    [activeVacanciesRow],
    stageCounts,
    vacancyRows,
    interviewStats,
    rejectionsByReason,
    rejectionsByInitiator,
    contactStats,
    contactsByOutcome,
    contactsNoFitReasons,
    autoReasonRows,
    vacancyOptionRows,
  ] = await Promise.all([
    // 1. Активные вакансии — текущее состояние (за всё время)
    db.select({ value: count() })
      .from(vacancies)
      .where(and(
        eq(vacancies.companyId, companyId),
        inArray(vacancies.status, ACTIVE_VACANCY_STATUSES),
        isNull(vacancies.deletedAt),
        ...vacancyFilter,
      )),

    // 2. Кандидаты по стадиям — воронка (текущее состояние, всегда за всё время)
    db.select({
      stage: candidates.stage,
      cnt: count(),
    })
      .from(candidates)
      .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
      .where(and(
        eq(vacancies.companyId, companyId),
        isNull(vacancies.deletedAt),
        isNull(candidates.deletedAt),
        ...vacancyFilter,
      ))
      .groupBy(candidates.stage),

    // 3. По вакансиям: откликов / нанято / интервью / отказов — за период
    db.select({
      vacancyId:    vacancies.id,
      vacancyTitle: vacancies.title,
      createdAt:    vacancies.createdAt,
      status:       vacancies.status,
      closedAt:     vacancies.closedAt,
      hhArchived:   vacancies.hhArchived,
      hhExpiresAt:  vacancies.hhExpiresAt,
      total:        count(),
      hired:        sql<number>`count(*) filter (where ${candidates.stage} = 'hired')`.mapWith(Number),
      rejected:     sql<number>`count(*) filter (where ${candidates.stage} = 'rejected')`.mapWith(Number),
      selfRejected: sql<number>`count(*) filter (where ${candidates.rejectionInitiator} = 'candidate')`.mapWith(Number),
      // «Анкет» = демо + тест: кандидаты на стадиях демо и тестового задания
      // (anketa_filled оставляем в наборе — это часть того же «анкетного» этапа).
      anketa:       sql<number>`count(*) filter (where ${candidates.stage} in ('demo_opened','demo','anketa_filled','anketa','test_task_sent','test_task_done','test_passed','test_failed'))`.mapWith(Number),
      decision:     sql<number>`count(*) filter (where ${candidates.stage} in ('decision','final_decision'))`.mapWith(Number),
      interview:    sql<number>`count(*) filter (where ${candidates.stage} in ('scheduled','interview','interviewed'))`.mapWith(Number),
    })
      .from(candidates)
      .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
      .where(and(
        eq(vacancies.companyId, companyId),
        isNull(vacancies.deletedAt),
        isNull(candidates.deletedAt),
        ...vacancyFilter,
        ...candidateDateFilters,
      ))
      .groupBy(vacancies.id, vacancies.title, vacancies.createdAt, vacancies.status, vacancies.closedAt, vacancies.hhArchived, vacancies.hhExpiresAt),

    // 4. Собеседования — за период
    db.select({
      interviewStatus: calendarEvents.interviewStatus,
      hasMeetingUrl:   sql<boolean>`(${calendarEvents.meetingUrl} is not null and ${calendarEvents.meetingUrl} != '')`.mapWith(Boolean),
      cnt:             count(),
    })
      .from(calendarEvents)
      .where(and(
        eq(calendarEvents.companyId, companyId),
        eq(calendarEvents.type, "interview"),
        ...eventVacancyFilter,
        ...eventDateFilters,
      ))
      .groupBy(calendarEvents.interviewStatus, sql`(${calendarEvents.meetingUrl} is not null and ${calendarEvents.meetingUrl} != '')`),

    // 5. Причины отказа — за период
    db.select({
      category: candidates.rejectionReasonCategory,
      cnt: count(),
    })
      .from(candidates)
      .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
      .where(and(
        eq(vacancies.companyId, companyId),
        eq(candidates.stage, "rejected"),
        isNull(vacancies.deletedAt),
        isNull(candidates.deletedAt),
        ...vacancyFilter,
        ...candidateDateFilters,
      ))
      .groupBy(candidates.rejectionReasonCategory),

    // 6. Инициатор отказа — за период
    db.select({
      initiator: candidates.rejectionInitiator,
      cnt: count(),
    })
      .from(candidates)
      .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
      .where(and(
        eq(vacancies.companyId, companyId),
        eq(candidates.stage, "rejected"),
        isNull(vacancies.deletedAt),
        isNull(candidates.deletedAt),
        ...vacancyFilter,
        ...candidateDateFilters,
      ))
      .groupBy(candidates.rejectionInitiator),

    // 7. Контакты по каналу — за период
    db.select({
      channel: candidateContacts.channel,
      cnt: count(),
    })
      .from(candidateContacts)
      .where(and(
        eq(candidateContacts.tenantId, companyId),
        ...contactVacancyFilter,
        ...contactDateFilters,
      ))
      .groupBy(candidateContacts.channel),

    // 8. Контакты по исходу — за период
    db.select({
      outcome: candidateContacts.outcome,
      cnt: count(),
    })
      .from(candidateContacts)
      .where(and(
        eq(candidateContacts.tenantId, companyId),
        ...contactVacancyFilter,
        ...contactDateFilters,
      ))
      .groupBy(candidateContacts.outcome),

    // 9. Причина «не подошёл» (no_fit) по reasonCategory — за период
    db.select({
      reasonCategory: candidateContacts.reasonCategory,
      cnt: count(),
    })
      .from(candidateContacts)
      .where(and(
        eq(candidateContacts.tenantId, companyId),
        eq(candidateContacts.outcome, "no_fit"),
        ...contactVacancyFilter,
        ...contactDateFilters,
      ))
      .groupBy(candidateContacts.reasonCategory),

    // 10. Автоматические причины отказа/остановки (auto_processing_stopped_reason) —
    // за период. Это системные причины (AI, стоп-факторы, дедуп), которых нет в
    // ручной таксономии — тянем в отчёт, чтобы он был полнее без ручного ввода.
    db.select({
      reason: candidates.autoProcessingStoppedReason,
      cnt: count(),
    })
      .from(candidates)
      .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
      .where(and(
        eq(vacancies.companyId, companyId),
        isNull(vacancies.deletedAt),
        isNull(candidates.deletedAt),
        sql`${candidates.autoProcessingStoppedReason} is not null`,
        ...vacancyFilter,
        ...candidateDateFilters,
      ))
      .groupBy(candidates.autoProcessingStoppedReason),

    // 11. Список вакансий для дропдауна (все живые вакансии компании)
    db.select({
      id:    vacancies.id,
      title: vacancies.title,
    })
      .from(vacancies)
      .where(and(
        eq(vacancies.companyId, companyId),
        isNull(vacancies.deletedAt),
      ))
      .orderBy(vacancies.title),
  ])

  // ─── Воронка ──────────────────────────────────────────────────────
  const stageTotals: Record<string, number> = {}
  for (const row of stageCounts) {
    if (row.stage) stageTotals[row.stage] = Number(row.cnt)
  }

  const totalCandidates = vacancyRows.reduce((s, r) => s + Number(r.total), 0)

  const LEGACY_EXTRA = ["demo", "interviewed", "final_decision", "offer", "wants_contact", "talent_pool"]
  const funnelStages = [
    ...ALL_STAGE_SLUGS.map(slug => ({
      slug,
      label: PLATFORM_STAGES[slug].defaultLabel,
      count: stageTotals[slug] ?? 0,
      isTerminal: PLATFORM_STAGES[slug].isTerminal,
    })),
    ...LEGACY_EXTRA
      .filter(slug => (stageTotals[slug] ?? 0) > 0)
      .map(slug => ({
        slug,
        label: slug === "demo" ? "На демо" : slug === "interviewed" ? "Прошёл интервью"
          : slug === "final_decision" ? "Финальное решение" : slug === "offer" ? "Оффер"
          : slug === "wants_contact" ? "Хочет контакт" : "Резерв",
        count: stageTotals[slug] ?? 0,
        isTerminal: false,
      })),
  ]

  // ─── Интервью ─────────────────────────────────────────────────────
  let interviewTotal = 0
  let interviewConducted = 0
  let interviewNoShow = 0
  let interviewOnline = 0
  let interviewOffline = 0
  for (const row of interviewStats) {
    const n = Number(row.cnt)
    interviewTotal += n
    if (row.interviewStatus === "Пройдено") interviewConducted += n
    if (row.interviewStatus === "Не явился") interviewNoShow += n
    if (row.hasMeetingUrl) interviewOnline += n
    else interviewOffline += n
  }

  // ─── Причины отказа ───────────────────────────────────────────────
  const rejectionByCategoryMap: Record<string, number> = {}
  for (const row of rejectionsByReason) {
    const key = row.category ?? "other"
    rejectionByCategoryMap[key] = (rejectionByCategoryMap[key] ?? 0) + Number(row.cnt)
  }

  const rejectionCategories: { id: string; label: string; count: number }[] = REJECTION_REASONS
    .map(r => ({ id: r.id as string, label: r.label as string, count: rejectionByCategoryMap[r.id] ?? 0 }))
    .filter(r => r.count > 0)

  if (rejectionByCategoryMap[""]) {
    rejectionCategories.push({ id: "unknown", label: "Не указана", count: rejectionByCategoryMap[""] })
  }

  const rejectionInitiatorMap: Record<string, number> = {}
  for (const row of rejectionsByInitiator) {
    const key = row.initiator ?? "unknown"
    rejectionInitiatorMap[key] = (rejectionInitiatorMap[key] ?? 0) + Number(row.cnt)
  }

  const rejectionInitiators = REJECTION_INITIATORS.map(i => ({
    id: i.id,
    label: i.label,
    count: rejectionInitiatorMap[i.id] ?? 0,
  }))

  // ─── По вакансиям ─────────────────────────────────────────────────
  const nowMs = Date.now()
  const vacancyTable = vacancyRows.map(r => ({
    vacancyId: r.vacancyId,
    vacancyTitle: r.vacancyTitle,
    publishedDaysAgo: r.createdAt ? Math.max(0, Math.floor((nowMs - new Date(r.createdAt).getTime()) / 86_400_000)) : null,
    lifecycle: getVacancyLifecycle(r.status),          // active | paused | closed
    closedAt: r.closedAt ? new Date(r.closedAt).toISOString() : null,
    hhArchived: r.hhArchived ?? null,
    hhExpiresAt: r.hhExpiresAt ? new Date(r.hhExpiresAt).toISOString() : null,
    total: Number(r.total),
    hired: Number(r.hired),
    rejected: Number(r.rejected),
    selfRejected: Number(r.selfRejected),
    anketa: Number(r.anketa),
    decision: Number(r.decision),
    interview: Number(r.interview),
  }))

  // ─── Автоматические причины отказа ─────────────────────────────────
  const autoReasonMap: Record<string, number> = {}
  for (const row of autoReasonRows) {
    const key = autoReasonKey(row.reason)
    autoReasonMap[key] = (autoReasonMap[key] ?? 0) + Number(row.cnt)
  }
  const automaticReasons = Object.entries(autoReasonMap)
    .map(([id, cnt]) => ({ id, label: autoReasonLabel(id), count: cnt }))
    .sort((a, b) => b.count - a.count)

  const totalRejected = vacancyTable.reduce((s, r) => s + r.rejected, 0)
  const totalHired    = vacancyTable.reduce((s, r) => s + r.hired, 0)

  // ─── Контакты ─────────────────────────────────────────────────────
  const channelMap: Record<string, number> = {}
  for (const row of contactStats) {
    channelMap[row.channel ?? "other"] = (channelMap[row.channel ?? "other"] ?? 0) + Number(row.cnt)
  }
  const totalContacts = Object.values(channelMap).reduce((s, v) => s + v, 0)

  const byChannel = CONTACT_CHANNELS.map(c => ({
    id: c.id,
    label: c.label,
    count: channelMap[c.id] ?? 0,
  }))

  const outcomeMap: Record<string, number> = {}
  for (const row of contactsByOutcome) {
    outcomeMap[row.outcome ?? "pending"] = (outcomeMap[row.outcome ?? "pending"] ?? 0) + Number(row.cnt)
  }

  const byOutcome = CONTACT_OUTCOMES.map(o => ({
    id: o.id,
    label: o.label,
    count: outcomeMap[o.id] ?? 0,
  }))

  const noFitReasonMap: Record<string, number> = {}
  for (const row of contactsNoFitReasons) {
    const key = row.reasonCategory ?? "other"
    noFitReasonMap[key] = (noFitReasonMap[key] ?? 0) + Number(row.cnt)
  }

  const noFitByReason = REJECTION_REASONS
    .map(r => ({ id: r.id as string, label: r.label as string, count: noFitReasonMap[r.id] ?? 0 }))
    .filter(r => r.count > 0)

  if (noFitReasonMap["other"] && !REJECTION_REASONS.find(r => r.id === "other")) {
    noFitByReason.push({ id: "other", label: "Другое", count: noFitReasonMap["other"] })
  }
  if (noFitReasonMap[""] || noFitReasonMap["null"]) {
    const unknownCount = (noFitReasonMap[""] ?? 0) + (noFitReasonMap["null"] ?? 0)
    if (unknownCount > 0) noFitByReason.push({ id: "unknown", label: "Не указана", count: unknownCount })
  }

  return {
    period,
    range: { from: from ? from.toISOString() : null, to: to ? to.toISOString() : null },
    vacancyId: vacancyId ?? "all",
    vacancyOptions: vacancyOptionRows.map(v => ({ id: v.id, title: v.title })),
    kpi: {
      activeVacancies:    Number(activeVacanciesRow?.value ?? 0),
      totalCandidates,
      interviewScheduled: interviewTotal,
      interviewConducted,
      totalRejected,
      totalHired,
    },
    funnel: funnelStages,
    vacancyTable,
    interviews: {
      total:     interviewTotal,
      conducted: interviewConducted,
      noShow:    interviewNoShow,
      online:    interviewOnline,
      offline:   interviewOffline,
    },
    rejections: {
      byCategory:  rejectionCategories,
      byInitiator: rejectionInitiators,
      automatic:   automaticReasons,
    },
    contacts: {
      total: totalContacts,
      byChannel,
      byOutcome,
      noFitByReason,
    },
  }
}

export type ReportResult = Awaited<ReturnType<typeof buildReport>>
