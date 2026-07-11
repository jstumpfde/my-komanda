/**
 * Расписания автоматической отправки отчётов в Bitrix.
 *
 * Сущность rop_report_schedules:
 *   - кому отправлять (recipientKind='user'|'chat', recipientId=bitrix user id или "chatN")
 *   - с какой частотой (frequency='daily'|'weekly', timeHhmm, daysOfWeek)
 *   - за какой период (periodKind: yesterday/today/last_7_days/last_week/this_week/last_month)
 *   - какой именно отчёт (scope='manager'|'team', managerId)
 *
 * Cron-роут AI-РОП (`/api/cron/ai-rop-reports`, фаза 3) раз в минуту дёргает
 * getDueSchedules() и для каждого вызывает runScheduled().
 *
 * Порт call-agent lib/reports-scheduler.ts. Отличия: CRUD через Drizzle ORM
 * вместо ручного SQLite/PG dual-compat (rop_report_schedules — только PG,
 * типы приходят из schema.ts напрямую); id — uuid вместо int; Bitrix-конфиг
 * (webhook/dryRun) передаётся параметром в runScheduled — НЕ читается из env
 * (п.5 плана, per-company rop_settings собирает вызывающая сторона).
 */
import { eq, and, lte, isNotNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropReportSchedules, type RopReportSchedule, type NewRopReportSchedule } from "@/lib/db/schema"
import { generateReport } from "./reports"
import { imSendMessage } from "./bitrix-im"
import { createBitrixClient } from "./bitrix"
import type { RopBitrixConfig } from "./types"

export type ScheduleScope = "manager" | "team"
export type ScheduleFrequency = "daily" | "weekly"
export type ScheduleRecipientKind = "user" | "chat"
export type SchedulePeriodKind =
  | "yesterday"
  | "today"
  | "last_7_days"
  | "last_week"
  | "this_week"
  | "last_month"

export interface ScheduleInput {
  tenantId: string
  name: string
  scope: ScheduleScope
  managerId?: string | null
  recipientKind: ScheduleRecipientKind
  recipientId: string
  recipientName?: string | null
  frequency: ScheduleFrequency
  time: string                  // HH:MM
  daysOfWeek?: number[] | null  // 1..7 для weekly
  periodKind: SchedulePeriodKind
  enabled?: boolean
}

export interface SchedulePatch {
  name?: string
  scope?: ScheduleScope
  managerId?: string | null
  recipientKind?: ScheduleRecipientKind
  recipientId?: string
  recipientName?: string | null
  frequency?: ScheduleFrequency
  time?: string
  daysOfWeek?: number[] | null
  periodKind?: SchedulePeriodKind
  enabled?: boolean
}

export interface RunResult {
  ok: boolean
  error?: string
  messageId?: number
  title?: string
}

// ───────────────────────────────────────────────────────────────────
// Расчёт next_run_at

/** Хелпер: установить часы/минуты + сбросить секунды/мс. */
function setHM(d: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map((x) => parseInt(x, 10))
  const out = new Date(d)
  out.setHours(Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0, 0, 0)
  return out
}

/** Хелпер: 1..7 (пн..вс) для Date. */
function isoDayOfWeek(d: Date): number {
  const js = d.getDay() // 0=вс,1=пн,...,6=сб
  return js === 0 ? 7 : js
}

/**
 * Вычислить следующее срабатывание расписания.
 *
 *  - daily: сегодня в time, если ещё не наступило; иначе завтра в time.
 *  - weekly: ближайший день из daysOfWeek (1..7) ≥ fromDate с указанным time.
 */
export function computeNextRunAt(
  schedule: { frequency: ScheduleFrequency; timeHhmm: string; daysOfWeek: string | null },
  fromDate: Date = new Date()
): Date {
  const base = new Date(fromDate)
  base.setSeconds(0, 0)

  if (schedule.frequency === "daily") {
    const today = setHM(base, schedule.timeHhmm)
    if (today.getTime() > base.getTime()) return today
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    return tomorrow
  }

  // weekly
  let days: number[] = []
  try {
    if (schedule.daysOfWeek) days = JSON.parse(schedule.daysOfWeek) as number[]
  } catch {
    days = []
  }
  days = days.filter((d) => Number.isFinite(d) && d >= 1 && d <= 7)
  if (days.length === 0) {
    // Защита от мусорных данных: считаем как daily, чтобы не зависнуть.
    return computeNextRunAt({ ...schedule, frequency: "daily" }, fromDate)
  }

  // Ищем в окне 0..7 дней вперёд первый день из списка с подходящим временем.
  for (let offset = 0; offset <= 7; offset++) {
    const candidate = new Date(base)
    candidate.setDate(candidate.getDate() + offset)
    const at = setHM(candidate, schedule.timeHhmm)
    if (!days.includes(isoDayOfWeek(at))) continue
    if (at.getTime() > base.getTime()) return at
  }
  // На всякий случай (теоретически недостижимо): на 7 дней вперёд от base.
  const fallback = setHM(base, schedule.timeHhmm)
  fallback.setDate(fallback.getDate() + 7)
  return fallback
}

// ───────────────────────────────────────────────────────────────────
// Период (для какого диапазона дат строить отчёт)

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}
function startOfWeekMon(d: Date): Date {
  // Понедельник как первый день недели (как везде в проекте).
  const x = new Date(d)
  const day = x.getDay()
  const diff = day === 0 ? 6 : day - 1
  x.setDate(x.getDate() - diff)
  x.setHours(0, 0, 0, 0)
  return x
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

/**
 * Разрешить тип периода в конкретный диапазон дат (ISO YYYY-MM-DD).
 * Текст label — для единообразия в заголовке отчёта.
 */
export function resolvePeriod(
  periodKind: SchedulePeriodKind,
  now: Date = new Date()
): { from: string; to: string; label: string } {
  switch (periodKind) {
    case "yesterday": {
      const d = new Date(now)
      d.setDate(d.getDate() - 1)
      const s = isoDate(d)
      return { from: s, to: s, label: "Вчера" }
    }
    case "today": {
      const s = isoDate(now)
      return { from: s, to: s, label: "Сегодня" }
    }
    case "last_7_days": {
      const from = new Date(now)
      from.setDate(from.getDate() - 6)
      return { from: isoDate(from), to: isoDate(now), label: "Последние 7 дней" }
    }
    case "last_week": {
      const thisMon = startOfWeekMon(now)
      const lastSun = new Date(thisMon)
      lastSun.setDate(lastSun.getDate() - 1)
      const lastMon = startOfWeekMon(lastSun)
      return { from: isoDate(lastMon), to: isoDate(lastSun), label: "Прошлая неделя" }
    }
    case "this_week": {
      const mon = startOfWeekMon(now)
      return { from: isoDate(mon), to: isoDate(now), label: "Эта неделя" }
    }
    case "last_month": {
      const firstThis = startOfMonth(now)
      const lastEnd = new Date(firstThis)
      lastEnd.setDate(lastEnd.getDate() - 1)
      const lastStart = startOfMonth(lastEnd)
      return { from: isoDate(lastStart), to: isoDate(lastEnd), label: "Прошлый месяц" }
    }
  }
}

// ───────────────────────────────────────────────────────────────────
// CRUD

export async function listSchedules(tenantId: string): Promise<RopReportSchedule[]> {
  return db
    .select()
    .from(ropReportSchedules)
    .where(eq(ropReportSchedules.tenantId, tenantId))
    .orderBy(ropReportSchedules.createdAt)
}

export async function getSchedule(id: string, tenantId: string): Promise<RopReportSchedule | null> {
  const [row] = await db
    .select()
    .from(ropReportSchedules)
    .where(and(eq(ropReportSchedules.id, id), eq(ropReportSchedules.tenantId, tenantId)))
    .limit(1)
  return row ?? null
}

export async function createSchedule(input: ScheduleInput): Promise<RopReportSchedule> {
  const daysJson =
    input.frequency === "weekly" && input.daysOfWeek && input.daysOfWeek.length > 0
      ? JSON.stringify(input.daysOfWeek)
      : null

  const nextRun = computeNextRunAt(
    { frequency: input.frequency, timeHhmm: input.time, daysOfWeek: daysJson },
    new Date()
  )

  const [created] = await db
    .insert(ropReportSchedules)
    .values({
      tenantId: input.tenantId,
      name: input.name,
      scope: input.scope,
      managerId: input.managerId ?? null,
      recipientKind: input.recipientKind,
      recipientId: input.recipientId,
      recipientName: input.recipientName ?? null,
      frequency: input.frequency,
      timeHhmm: input.time,
      daysOfWeek: daysJson,
      periodKind: input.periodKind,
      enabled: input.enabled === false ? false : true,
      nextRunAt: nextRun,
    })
    .returning()

  if (!created) throw new Error("INSERT не вернул созданную запись расписания")
  return created
}

export async function updateSchedule(
  id: string,
  tenantId: string,
  patch: SchedulePatch
): Promise<RopReportSchedule | null> {
  const current = await getSchedule(id, tenantId)
  if (!current) return null

  const merged = {
    name: patch.name ?? current.name,
    scope: patch.scope ?? current.scope,
    managerId: patch.managerId !== undefined ? (patch.managerId ?? null) : current.managerId,
    recipientKind: patch.recipientKind ?? current.recipientKind,
    recipientId: patch.recipientId ?? current.recipientId,
    recipientName: patch.recipientName !== undefined ? (patch.recipientName ?? null) : current.recipientName,
    frequency: (patch.frequency ?? current.frequency) as ScheduleFrequency,
    timeHhmm: patch.time ?? current.timeHhmm,
    daysOfWeek:
      patch.daysOfWeek !== undefined
        ? patch.daysOfWeek && patch.daysOfWeek.length > 0
          ? JSON.stringify(patch.daysOfWeek)
          : null
        : current.daysOfWeek,
    periodKind: patch.periodKind ?? current.periodKind,
    enabled: patch.enabled !== undefined ? patch.enabled : !!current.enabled,
  }

  // Пересчитываем next_run_at если поменялось расписание (freq/time/days) или
  // если расписание включается снова (после выключения старый next_run_at мог устареть).
  const timingChanged =
    patch.frequency !== undefined ||
    patch.time !== undefined ||
    patch.daysOfWeek !== undefined ||
    (patch.enabled === true && !current.enabled)

  const updateValues: Partial<NewRopReportSchedule> = { ...merged, updatedAt: new Date() }
  if (timingChanged) {
    updateValues.nextRunAt = computeNextRunAt(
      { frequency: merged.frequency, timeHhmm: merged.timeHhmm, daysOfWeek: merged.daysOfWeek },
      new Date()
    )
  }

  await db
    .update(ropReportSchedules)
    .set(updateValues)
    .where(and(eq(ropReportSchedules.id, id), eq(ropReportSchedules.tenantId, tenantId)))

  return getSchedule(id, tenantId)
}

export async function deleteSchedule(id: string, tenantId: string): Promise<void> {
  await db
    .delete(ropReportSchedules)
    .where(and(eq(ropReportSchedules.id, id), eq(ropReportSchedules.tenantId, tenantId)))
}

/**
 * Расписания, которые пора запустить (enabled=true, next_run_at ≤ now).
 * Сортируем по next_run_at ASC чтобы более «просроченные» шли первыми.
 */
export async function getDueSchedules(now: Date = new Date()): Promise<RopReportSchedule[]> {
  return db
    .select()
    .from(ropReportSchedules)
    .where(and(
      eq(ropReportSchedules.enabled, true),
      isNotNull(ropReportSchedules.nextRunAt),
      lte(ropReportSchedules.nextRunAt, now),
    ))
    .orderBy(ropReportSchedules.nextRunAt)
    .limit(50)
}

// ───────────────────────────────────────────────────────────────────
// Исполнение расписания

/**
 * Сгенерировать и отправить отчёт по расписанию.
 *  1. Считаем период через resolvePeriod()
 *  2. generateReport(scope/managerId)
 *  3. imSendMessage(recipientId) через Bitrix-клиент компании — работает и
 *     для user_id, и для "chatN"
 *  4. UPDATE last_run_*, next_run_at
 *
 * bitrixConfig — per-company конфиг (webhook/dryRunMessages из rop_settings,
 * фаза 2b/3 собирает и передаёт); здесь НЕ читается из env.
 */
export async function runScheduled(s: RopReportSchedule, bitrixConfig: RopBitrixConfig): Promise<RunResult> {
  const period = resolvePeriod(s.periodKind as SchedulePeriodKind)
  let result: RunResult
  let title: string | undefined

  try {
    const report = await generateReport({
      tenantId: s.tenantId,
      scope: s.scope as ScheduleScope,
      managerId: s.managerId ?? undefined,
      from: period.from,
      to: period.to,
      periodLabel: period.label,
    })
    title = report.title

    const client = createBitrixClient(bitrixConfig)
    const send = await imSendMessage(client, s.recipientId, report.text, bitrixConfig.dryRunMessages)
    if (send.ok) {
      result = { ok: true, messageId: send.messageId, title }
    } else {
      result = { ok: false, error: send.error || "Bitrix не принял сообщение", title }
    }
  } catch (e) {
    result = { ok: false, error: e instanceof Error ? e.message : String(e), title }
  }

  // Обновляем итоги выполнения и считаем next_run_at от now (не от прошлого
  // запуска), чтобы расписание не «спамило» если крон пропустил несколько тиков.
  const now = new Date()
  const nextRun = computeNextRunAt(
    { frequency: s.frequency as ScheduleFrequency, timeHhmm: s.timeHhmm, daysOfWeek: s.daysOfWeek },
    now
  )

  try {
    await db
      .update(ropReportSchedules)
      .set({
        lastRunAt: now,
        lastRunStatus: result.ok ? "ok" : "failed",
        lastRunError: result.ok ? null : (result.error ?? null),
        nextRunAt: nextRun,
        updatedAt: now,
      })
      .where(eq(ropReportSchedules.id, s.id))
  } catch (e) {
    console.warn("[reports-scheduler] failed to update last_run:", (e as Error).message)
  }

  return result
}
