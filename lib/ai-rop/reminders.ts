/**
 * §5.3 движок напоминаний — порт call-agent lib/reminders.ts. Регэкспы парсера
 * дат перенесены БЕРЕЖНО 1:1 (готча: JS \b не распознаёт кириллицу — только
 * ASCII, поэтому границы слов после русских названий месяцев/предлогов НЕ
 * используют \b, см. комментарии внутри). Таблица — rop_reminders (миграция
 * 0276), без ленивого CREATE TABLE оригинала.
 *
 * ОТЛИЧИЕ от оригинала: схема (lib/db/schema.ts::ropReminders, чужая зона)
 * документирует статус как pending|done|dismissed (3 состояния) — БЕЗ
 * отдельного 'snoozed' оригинала (4 состояния: pending/completed/snoozed/
 * dismissed). Колонка — обычный text без CHECK, технически 'snoozed' тоже
 * поместился бы, но чтобы не разъезжаться с документированной конвенцией
 * схемы, snoozeReminder() здесь просто двигает dueAt, оставляя статус
 * 'pending' (снушенное напоминание — это pending с более поздним сроком,
 * функционально эквивалентно, теряется только отдельная UI-метка «отложено»).
 */
import { and, asc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropReminders, type RopReminder } from "@/lib/db/schema"

export type ReminderStatus = "pending" | "done" | "dismissed"

// Русские названия месяцев в родительном падеже → индекс месяца (0-based), для «15 июля».
const MONTH_NAMES: Record<string, number> = {
  "января": 0, "февраля": 1, "марта": 2, "апреля": 3, "мая": 4, "июня": 5,
  "июля": 6, "августа": 7, "сентября": 8, "октября": 9, "ноября": 10, "декабря": 11,
}

/**
 * Ищет АБСОЛЮТНУЮ дату (день+месяц) в тексте: «15 июля», «15.07», «15.07.2026».
 * Возвращает Date с временем 10:00 (дефолт, может быть переопределён extractTimeOfDay)
 * или null если абсолютная дата не найдена.
 *
 * Если год не указан — берём текущий год из baseDate; если получившаяся дата уже в
 * прошлом больше чем на день — берём следующий год (защита от «15 июля» сказанного
 * в декабре, имея в виду ближайшее 15 июля, а не прошедшее).
 */
function tryParseAbsoluteDate(t: string, base: Date): Date | null {
  let day: number
  let month: number // 0-based
  let year: number | null = null

  // Без \b после названия месяца: JS \w и, следовательно, \b не распознают кириллицу
  // (только ASCII-буквы), поэтому \b между пробелом/концом строки и «июля» никогда не
  // сработает и матч всегда проваливался бы. \b перед \d безопасен — цифры входят в \w.
  const monthMatch = t.match(/\b(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)/)
  if (monthMatch) {
    day = parseInt(monthMatch[1], 10)
    month = MONTH_NAMES[monthMatch[2]]
  } else {
    const dotMatch = t.match(/\b(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?\b/)
    if (!dotMatch) return null
    day = parseInt(dotMatch[1], 10)
    month = parseInt(dotMatch[2], 10) - 1
    if (dotMatch[3]) {
      year = parseInt(dotMatch[3], 10)
      if (year < 100) year += 2000
    }
  }

  if (month < 0 || month > 11 || day < 1 || day > 31) return null

  const targetYear = year ?? base.getFullYear()
  const baseMidnight = new Date(base.getFullYear(), base.getMonth(), base.getDate())
  let candidate = new Date(targetYear, month, day, 10, 0, 0, 0)
  if (year === null && candidate.getTime() < baseMidnight.getTime() - 24 * 60 * 60 * 1000) {
    candidate = new Date(targetYear + 1, month, day, 10, 0, 0, 0)
  }
  return candidate
}

/**
 * Ищет время суток/явное время в тексте: «утром», «вечером», «после обеда»,
 * «в 15:00», «в 15 часов». Явное время приоритетнее общих «утром/днём/вечером».
 * Возвращает null если ничего не найдено — вызывающий код тогда оставляет
 * дефолтное время (10:00) без изменений.
 */
function extractTimeOfDay(t: string): { hours: number; minutes: number } | null {
  // (?:^|\s) вместо \b перед «в»: JS \b не распознаёт границу до кириллицы
  // (\w = только ASCII), поэтому \bв никогда бы не сработал.
  const hm = t.match(/(?:^|\s)в\s+(\d{1,2}):(\d{2})\b/)
  if (hm) {
    const h = parseInt(hm[1], 10)
    const m = parseInt(hm[2], 10)
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) return { hours: h, minutes: m }
  }

  const hOnly = t.match(/(?:^|\s)в\s+(\d{1,2})\s*час/)
  if (hOnly) {
    const h = parseInt(hOnly[1], 10)
    if (h >= 0 && h <= 23) return { hours: h, minutes: 0 }
  }

  if (/после\s+обеда|в\s+обед/.test(t)) return { hours: 14, minutes: 0 }
  if (/утром/.test(t)) return { hours: 9, minutes: 0 }
  if (/днём|днем/.test(t)) return { hours: 14, minutes: 0 }
  if (/вечером/.test(t)) return { hours: 18, minutes: 0 }

  return null
}

/**
 * Парсит фразы из analysis.next_action / analysis.callback_phrase и возвращает дату когда напомнить.
 * Поддерживает:
 *   - «через 3 дня», «через час», «через 2 недели»
 *   - «завтра», «послезавтра», «сегодня»
 *   - «в понедельник», «в среду», «в пятницу»
 *   - «через неделю»
 *   - АБСОЛЮТНЫЕ даты: «15 июля», «15.07», «15.07.2026»
 *   - время суток / явное время (комбинируется с датой выше): «утром», «вечером»,
 *     «после обеда», «в 15:00», «в 15 часов» — переопределяет дефолтные 10:00
 * Если не распознано — null (напоминание не создаётся).
 */
export function parseDueDate(nextAction: string, baseDate: Date = new Date()): Date | null {
  if (!nextAction) return null
  const t = nextAction.toLowerCase()
  const base = new Date(baseDate)

  // 1) Абсолютная дата (день+месяц) — приоритетный путь, определяет базовый день.
  let result: Date | null = tryParseAbsoluteDate(t, base)

  // 2) Существующая логика (через N / завтра / послезавтра / день недели) — если
  //    абсолютная дата не найдена.
  if (!result) {
    const m1 = t.match(/через\s+(\d+)\s+(минут|час|часа|часов|день|дня|дней|недел[яиью])/)
    if (m1) {
      const n = parseInt(m1[1], 10)
      const unit = m1[2]
      const b = new Date(base)
      if (/минут/.test(unit)) b.setMinutes(b.getMinutes() + n)
      else if (/час/.test(unit)) b.setHours(b.getHours() + n)
      else if (/день|дня|дней/.test(unit)) b.setDate(b.getDate() + n)
      else if (/недел/.test(unit)) b.setDate(b.getDate() + n * 7)
      result = b
    }
  }

  if (!result && /через\s+час/.test(t)) { const b = new Date(base); b.setHours(b.getHours() + 1); result = b }
  if (!result && /через\s+полчаса/.test(t)) { const b = new Date(base); b.setMinutes(b.getMinutes() + 30); result = b }
  if (!result && /через\s+день/.test(t)) { const b = new Date(base); b.setDate(b.getDate() + 1); result = b }
  if (!result && /через\s+недел/.test(t)) { const b = new Date(base); b.setDate(b.getDate() + 7); result = b }

  if (!result && /завтра/.test(t)) { const b = new Date(base); b.setDate(b.getDate() + 1); b.setHours(10, 0, 0, 0); result = b }
  if (!result && /послезавтра/.test(t)) { const b = new Date(base); b.setDate(b.getDate() + 2); b.setHours(10, 0, 0, 0); result = b }

  if (!result) {
    const weekdays: Record<string, number> = {
      "понедельник": 1, "вторник": 2, "сред": 3, "четверг": 4, "пятниц": 5, "суббот": 6, "воскресен": 0,
    }
    for (const [name, idx] of Object.entries(weekdays)) {
      if (t.includes(`в ${name}`) || t.includes(`во ${name}`)) {
        const b = new Date(base)
        const today = b.getDay()
        let diff = idx - today
        if (diff <= 0) diff += 7
        b.setDate(b.getDate() + diff)
        b.setHours(10, 0, 0, 0)
        result = b
        break
      }
    }
  }

  if (!result) return null

  // 3) Время суток / явное время — отдельный проход по той же строке, применяется
  //    ПОВЕРХ найденного дня (переопределяет дефолтные 10:00, если что-то найдено).
  const time = extractTimeOfDay(t)
  if (time) result.setHours(time.hours, time.minutes, 0, 0)

  return result
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s
}

/**
 * Создаёт reminder из анализа звонка. Идемпотентно — если для этого call уже
 * есть pending reminder, не дублируем.
 *
 * Приоритет источника даты:
 *   1. callbackPhrase (analysis.callback_phrase, только если callback_agreed=true) —
 *      точная озвученная в разговоре договорённость.
 *   2. nextAction — общая AI-сводка «что дальше».
 */
export async function createReminderFromAnalysis(args: {
  companyId: string
  callId: string
  bitrixManagerId: string | null
  nextAction: string
  clientName: string | null
  clientPhone: string | null
  /** analysis.callback_phrase — прокидывается только когда callback_agreed=true. */
  callbackPhrase?: string | null
}): Promise<string | null> {
  if (!args.bitrixManagerId) return null

  const who = args.clientName || args.clientPhone || "заказчиком"

  let dueAt: Date | null = null
  let title: string | null = null

  if (args.callbackPhrase && args.callbackPhrase.trim()) {
    const parsed = parseDueDate(args.callbackPhrase)
    if (parsed) {
      dueAt = parsed
      title = `Согласованный созвон: ${truncate(args.callbackPhrase, 80)} (с ${who})`
    }
  }

  if (!dueAt) {
    if (!args.nextAction) return null
    dueAt = parseDueDate(args.nextAction)
    if (!dueAt) return null
    title = `${truncate(args.nextAction, 80)} (с ${who})`
  }

  const [existing] = await db
    .select({ id: ropReminders.id })
    .from(ropReminders)
    .where(and(eq(ropReminders.callId, args.callId), eq(ropReminders.status, "pending")))
    .limit(1)
  if (existing) return null

  const [created] = await db
    .insert(ropReminders)
    .values({
      tenantId: args.companyId,
      bitrixManagerId: args.bitrixManagerId,
      callId: args.callId,
      title: title!,
      dueAt,
      status: "pending",
      source: "auto",
    })
    .returning({ id: ropReminders.id })
  return created?.id ?? null
}

export async function listReminders(opts: {
  companyId: string
  bitrixManagerId?: string | null
  status?: ReminderStatus
  limit?: number
}): Promise<RopReminder[]> {
  const clauses = [eq(ropReminders.tenantId, opts.companyId)]
  if (opts.bitrixManagerId) clauses.push(eq(ropReminders.bitrixManagerId, opts.bitrixManagerId))
  if (opts.status) clauses.push(eq(ropReminders.status, opts.status))
  return db
    .select()
    .from(ropReminders)
    .where(and(...clauses))
    .orderBy(asc(ropReminders.dueAt))
    .limit(opts.limit ?? 50)
}

export async function markReminderDone(id: string, companyId: string): Promise<void> {
  await db
    .update(ropReminders)
    .set({ status: "done", completedAt: new Date() })
    .where(and(eq(ropReminders.id, id), eq(ropReminders.tenantId, companyId)))
}

/** Откладывает напоминание на N часов вперёд — остаётся 'pending' (см. docblock файла). */
export async function snoozeReminder(id: string, companyId: string, hours: number): Promise<void> {
  const due = new Date()
  due.setHours(due.getHours() + hours)
  await db
    .update(ropReminders)
    .set({ status: "pending", dueAt: due })
    .where(and(eq(ropReminders.id, id), eq(ropReminders.tenantId, companyId)))
}
