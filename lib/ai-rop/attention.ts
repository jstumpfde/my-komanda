/**
 * «Точки внимания» — главный дашборд для собственника компании (визия
 * Юрия, 31.07): всё, что менеджеры упускают и что вручную в CRM не
 * отследить, на одном экране. Тон формулировок МЯГКИЙ и конструктивный —
 * «точки внимания», «недоработки», НЕ «косяки»/обвинения.
 *
 * Шесть категорий:
 *  1. promise_overdue — «Обещали и забыли»: next_action с датой в прошлом,
 *     после которой не было нового касания того же клиента.
 *  2. deal_silent — «Сделка молчит»: у клиента есть привязка к CRM
 *     (deal/lead), но давно нет никаких касаний (порог — silenceDays).
 *  3. discrepancy — «Расхождения с CRM»: нерешённые rop_discrepancies.
 *  4. weak_call — «Слабые звонки по важным клиентам»: оценка ≤ порога
 *     у звонков, привязанных к сделке/лиду.
 *  5. negative_trend — «Настроение клиента ухудшается»: последнее общение
 *     негативное, а до этого было позитивное.
 *  6. checklist_gap — «Провалы по чек-листу»: пункты чек-листа, которые
 *     вся команда систематически проваливает (та же агрегация, что и
 *     «Слабые места в скрипте» на дашборде — dashboard-data.ts).
 *
 * Категории 1/2/5 требуют полной хронологии касаний клиента (группировка по
 * нормализованному телефону — как в clients.ts::detectLooseThreads), поэтому
 * тянем «сырые» строки звонков одним запросом и агрегируем в памяти, а не
 * шесть отдельных тяжёлых SQL. Как и везде в модуле — КАЖДЫЙ запрос
 * обязан фильтроваться по tenantId.
 */
import { sql, type SQL } from "drizzle-orm"
import { db } from "@/lib/db"
import { normalizePhone } from "./pii-mask"
import { getRopSettings, getSettingsJson } from "./settings"

export type AttentionCategory =
  | "promise_overdue"
  | "deal_silent"
  | "discrepancy"
  | "weak_call"
  | "negative_trend"
  | "checklist_gap"

export const ATTENTION_CATEGORY_LABELS: Record<AttentionCategory, string> = {
  promise_overdue: "Обещали и забыли",
  deal_silent: "Сделка молчит",
  discrepancy: "Расхождения с CRM",
  weak_call: "Слабые звонки по важным клиентам",
  negative_trend: "Настроение клиента ухудшается",
  checklist_gap: "Провалы по чек-листу",
}

export const ATTENTION_CATEGORY_ORDER: AttentionCategory[] = [
  "promise_overdue", "deal_silent", "discrepancy", "weak_call", "negative_trend", "checklist_gap",
]

export interface AttentionItem {
  id: string
  category: AttentionCategory
  urgent: boolean
  text: string
  managerName: string | null
  daysAgo: number | null
  /** ISO-дата события — для сортировки и фильтра по периоду. */
  at: string | null
  href: string
}

export interface AttentionData {
  items: AttentionItem[]
  byCategory: Record<AttentionCategory, AttentionItem[]>
  total: number
  urgentCount: number
  silenceDays: number
  weakScoreThreshold: number
}

export interface AttentionSettings {
  /** Дней тишины по клиенту с живой сделкой, после которых считаем «сделка молчит». Дефолт 7. */
  silenceDays: number
  /** Порог оценки звонка (0-10), ниже/равно которого звонок по важному клиенту считается слабым. Дефолт 3. */
  weakCallScoreThreshold: number
}

export const DEFAULT_ATTENTION_SETTINGS: AttentionSettings = { silenceDays: 7, weakCallScoreThreshold: 3 }

export async function getAttentionSettings(companyId: string): Promise<AttentionSettings> {
  const row = await getRopSettings(companyId)
  const json = getSettingsJson(row)
  const raw = json.attention ?? {}
  const silenceDays = Number(raw.silenceDays)
  const weakCallScoreThreshold = Number(raw.weakCallScoreThreshold)
  return {
    silenceDays: Number.isFinite(silenceDays) && silenceDays > 0 ? Math.trunc(silenceDays) : DEFAULT_ATTENTION_SETTINGS.silenceDays,
    weakCallScoreThreshold: Number.isFinite(weakCallScoreThreshold) && weakCallScoreThreshold >= 0
      ? weakCallScoreThreshold
      : DEFAULT_ATTENTION_SETTINGS.weakCallScoreThreshold,
  }
}

export interface AttentionDataOpts {
  tenantId: string
  from?: string
  to?: string
  managerId?: string | null
  managerBitrixId?: string | null
}

interface TimelineRow {
  id: string
  client_phone: string
  started_at: string | null
  status: string
  duration_sec: number
  manager_id: string | null
  manager_name: string | null
  bitrix_deal_id: string | null
  bitrix_lead_id: string | null
  next_action: string | null
  sentiment: string | null
  manager_score: number | null
  client_name: string | null
}

function toMs(iso: string | null): number | null {
  if (!iso) return null
  const s = iso.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00")
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d.getTime()
}

function daysBetween(fromMs: number, toMsVal: number): number {
  return Math.max(0, Math.floor((toMsVal - fromMs) / 86400000))
}

function clientLabel(name: string | null, phone: string): string {
  return name?.trim() || phone
}

function withinPeriod(iso: string | null, from?: string, to?: string): boolean {
  if (!iso) return !from && !to
  const day = iso.slice(0, 10)
  if (from && day < from) return false
  if (to && day > to) return false
  return true
}

// ──────────────────────────────────────────────────────────────
// Парсинг обещанного срока из next_action — русские относительные и
// абсолютные формулировки. Возвращает null, если формулировку распознать
// не удалось (тогда категория 1 её просто пропускает — лучше пропустить,
// чем нафантазировать несуществующий срок).

const RELATIVE_DAYS_RE = /через\s+(\d+)\s*(?:дн|день|дня|дней)/i
const ABS_DATE_RE = /(\d{1,2})[.\/](\d{1,2})(?:[.\/](\d{2,4}))?/
const WEEKDAYS: Record<string, number> = {
  "воскресенье": 0, "понедельник": 1, "вторник": 2,
  "среду": 3, "среда": 3, "четверг": 4,
  "пятницу": 5, "пятница": 5, "субботу": 6, "суббота": 6,
}

function addDaysUtc(d: Date, n: number): Date {
  const r = new Date(d)
  r.setUTCDate(r.getUTCDate() + n)
  return r
}

function nextWeekdayUtc(from: Date, targetDow: number): Date {
  const d = addDaysUtc(from, 1)
  while (d.getUTCDay() !== targetDow) d.setUTCDate(d.getUTCDate() + 1)
  return d
}

export function parsePromiseDueDate(text: string | null, calledAt: Date): Date | null {
  if (!text) return null
  const t = text.toLowerCase()

  const rel = t.match(RELATIVE_DAYS_RE)
  if (rel) {
    const days = parseInt(rel[1], 10)
    if (days > 0) return addDaysUtc(calledAt, days)
  }
  if (/послезавтра/.test(t)) return addDaysUtc(calledAt, 2)
  if (/\bзавтра\b/.test(t)) return addDaysUtc(calledAt, 1)

  const abs = t.match(ABS_DATE_RE)
  if (abs) {
    const day = parseInt(abs[1], 10)
    const month = parseInt(abs[2], 10)
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const yearRaw = abs[3]
      let year = yearRaw ? (yearRaw.length === 2 ? 2000 + parseInt(yearRaw, 10) : parseInt(yearRaw, 10)) : calledAt.getUTCFullYear()
      let d = new Date(Date.UTC(year, month - 1, day))
      // Без явного года: если получившаяся дата ушла в прошлое больше чем на
      // ~10 месяцев от момента звонка — скорее всего имелся в виду год позже.
      if (!yearRaw && d.getTime() < calledAt.getTime() - 300 * 86400000) {
        year += 1
        d = new Date(Date.UTC(year, month - 1, day))
      }
      return d
    }
  }

  for (const [word, dow] of Object.entries(WEEKDAYS)) {
    if (t.includes(word)) return nextWeekdayUtc(calledAt, dow)
  }
  return null
}

// ──────────────────────────────────────────────────────────────

function buildTimelineWhere(opts: AttentionDataOpts): SQL {
  const parts: SQL[] = [
    sql`c.tenant_id = ${opts.tenantId}::uuid`,
    sql`c.client_phone IS NOT NULL`,
    sql`c.client_phone <> ''`,
  ]
  if (opts.managerBitrixId) parts.push(sql`c.manager_id = ${opts.managerBitrixId}`)
  else if (opts.managerId) parts.push(sql`c.manager_id = ${opts.managerId}`)
  return sql.join(parts, sql` AND `)
}

export async function loadAttentionData(opts: AttentionDataOpts): Promise<AttentionData> {
  const settings = await getAttentionSettings(opts.tenantId)
  const nowMs = Date.now()
  const where = buildTimelineWhere(opts)

  const [timelineRows, weakCallRows, discrepancyRows, checklistRows] = await Promise.all([
    // ── Полная хронология касаний по каждому клиенту (для категорий 1/2/5) ──
    // Ограничиваем окно 400 днями и 8000 строками — достаточно для истории
    // одного клиента, не тащим весь архив компании в память.
    db.execute(sql`
      SELECT c.id AS id, c.client_phone AS client_phone, c.started_at::text AS started_at,
             c.status AS status, c.duration_sec AS duration_sec,
             c.manager_id AS manager_id, c.manager_name AS manager_name,
             c.bitrix_deal_id AS bitrix_deal_id, c.bitrix_lead_id AS bitrix_lead_id,
             a.next_action AS next_action, a.sentiment AS sentiment,
             a.manager_score AS manager_score, a.client_name AS client_name
      FROM rop_calls c
      LEFT JOIN rop_analyses a ON a.call_id = c.id
      WHERE ${where}
        AND c.started_at >= (CURRENT_DATE - INTERVAL '400 day')
      ORDER BY c.started_at DESC NULLS LAST
      LIMIT 8000
    `) as unknown as Promise<TimelineRow[]>,

    // ── Слабые звонки по важным клиентам (сделка/лид привязаны) ──
    db.execute(sql`
      SELECT c.id AS id, c.started_at::text AS started_at, c.manager_id AS manager_id,
             c.manager_name AS manager_name, c.client_phone AS client_phone,
             a.manager_score AS manager_score, a.client_name AS client_name
      FROM rop_calls c
      JOIN rop_analyses a ON a.call_id = c.id
      WHERE ${where}
        AND (c.bitrix_deal_id IS NOT NULL OR c.bitrix_lead_id IS NOT NULL)
        AND a.manager_score IS NOT NULL AND a.manager_score <= ${settings.weakCallScoreThreshold}
      ORDER BY a.manager_score ASC, c.started_at DESC
      LIMIT 30
    `) as unknown as Promise<Array<{
      id: string; started_at: string | null; manager_id: string | null; manager_name: string | null
      client_phone: string | null; manager_score: number; client_name: string | null
    }>>,

    // ── Нерешённые расхождения с CRM ──
    db.execute(sql`
      SELECT d.id AS id, d.field_label AS field_label, d.field_name AS field_name,
             d.card_value AS card_value, d.suggested_value AS suggested_value,
             d.severity AS severity, d.created_at::text AS created_at,
             c.manager_name AS manager_name, c.manager_id AS manager_id, c.client_phone AS client_phone
      FROM rop_discrepancies d
      JOIN rop_calls c ON c.id = d.call_id
      WHERE d.tenant_id = ${opts.tenantId}::uuid
        AND d.status = 'pending'
        ${opts.managerBitrixId ? sql`AND c.manager_id = ${opts.managerBitrixId}` : opts.managerId ? sql`AND c.manager_id = ${opts.managerId}` : sql``}
      ORDER BY CASE d.severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, d.created_at DESC
      LIMIT 40
    `) as unknown as Promise<Array<{
      id: string; field_label: string | null; field_name: string; card_value: string | null
      suggested_value: string | null; severity: string; created_at: string | null
      manager_name: string | null; manager_id: string | null; client_phone: string | null
    }>>,

    // ── Чек-лист: сырые строки для агрегации пунктов, которые проваливает вся команда ──
    db.execute(sql`
      SELECT a.checklist_scores_json AS checklist_scores_json
      FROM rop_analyses a JOIN rop_calls c ON c.id = a.call_id
      WHERE a.checklist_scores_json IS NOT NULL AND ${where}
      LIMIT 2000
    `) as unknown as Promise<Array<{ checklist_scores_json: unknown }>>,
  ])

  const items: AttentionItem[] = []

  // ── Группировка хронологии по нормализованному телефону ──
  const groups = new Map<string, TimelineRow[]>()
  for (const r of timelineRows) {
    const norm = normalizePhone(r.client_phone)
    if (!norm) continue
    const arr = groups.get(norm)
    if (arr) arr.push(r)
    else groups.set(norm, [r])
  }
  // Внутри группы — гарантированно по убыванию даты (SQL уже так отдал, но
  // порядок при GROUP-BY в памяти не гарантирован при интерливинге — пересортируем).
  for (const arr of groups.values()) {
    arr.sort((a, b) => (toMs(b.started_at) ?? 0) - (toMs(a.started_at) ?? 0))
  }

  for (const [phone, rows] of groups) {
    const latest = rows[0]
    const name = clientLabel(latest.client_name, latest.client_phone || phone)

    // ── 1. Обещали и забыли (promise_overdue) ──
    for (const it of rows) {
      if (it.status !== "done" || !it.next_action) continue
      const calledMs = toMs(it.started_at)
      if (calledMs == null) continue
      const due = parsePromiseDueDate(it.next_action, new Date(calledMs))
      if (!due) continue
      const elapsedMs = nowMs - due.getTime()
      if (elapsedMs <= 86400000) continue // срок ещё не наступил или наступил <1 дня назад

      const followedUp = rows.some((other) => {
        if (other.id === it.id) return false
        const otherMs = toMs(other.started_at)
        return otherMs != null && otherMs > due.getTime()
      })
      if (followedUp) continue

      const daysAgo = daysBetween(due.getTime(), nowMs)
      const dueLabel = `${String(due.getUTCDate()).padStart(2, "0")}.${String(due.getUTCMonth() + 1).padStart(2, "0")}`
      items.push({
        id: `promise:${it.id}`,
        category: "promise_overdue",
        urgent: daysAgo >= 14,
        text: `Клиенту ${name} обещали «${it.next_action.slice(0, 80)}» (срок — до ${dueLabel}) — контакта не было ${daysAgo} дн.`,
        managerName: it.manager_name,
        daysAgo,
        at: it.started_at,
        href: `/ai-rop/clients/${phone}`,
      })
    }

    // ── 2. Сделка молчит (deal_silent) ──
    const hasCrmLink = rows.some((r) => r.bitrix_deal_id || r.bitrix_lead_id)
    const lastMs = toMs(latest.started_at)
    if (hasCrmLink && lastMs != null) {
      const daysAgo = daysBetween(lastMs, nowMs)
      if (daysAgo >= settings.silenceDays) {
        items.push({
          id: `silent:${phone}`,
          category: "deal_silent",
          urgent: daysAgo >= settings.silenceDays * 3,
          text: `По клиенту ${name} есть открытая сделка/лид в CRM, но касаний не было уже ${daysAgo} дн.`,
          managerName: latest.manager_name,
          daysAgo,
          at: latest.started_at,
          href: `/ai-rop/clients/${phone}`,
        })
      }
    }

    // ── 5. Настроение клиента ухудшается (negative_trend) ──
    const sentiments = rows.map((r) => r.sentiment).filter((s): s is string => !!s)
    if (sentiments.length >= 2 && sentiments[0] === "negative") {
      const idx = sentiments.slice(1).findIndex((s) => s !== "negative")
      if (idx !== -1 && sentiments[1 + idx] === "positive" && lastMs != null) {
        const daysAgo = daysBetween(lastMs, nowMs)
        items.push({
          id: `trend:${phone}`,
          category: "negative_trend",
          urgent: daysAgo <= 3,
          text: `У клиента ${name} настроение ухудшилось: раньше общение было позитивным, последнее — негативное.`,
          managerName: latest.manager_name,
          daysAgo,
          at: latest.started_at,
          href: `/ai-rop/clients/${phone}`,
        })
      }
    }
  }

  // ── 4. Слабые звонки по важным клиентам ──
  for (const r of weakCallRows) {
    const phoneNorm = r.client_phone ? normalizePhone(r.client_phone) : null
    const name = clientLabel(r.client_name, phoneNorm || r.client_phone || "клиент")
    items.push({
      id: `weak:${r.id}`,
      category: "weak_call",
      urgent: r.manager_score <= 1,
      text: `Слабый звонок по клиенту ${name} — оценка ${r.manager_score}/10, а сделка/лид привязаны в CRM.`,
      managerName: r.manager_name,
      daysAgo: r.started_at ? daysBetween(toMs(r.started_at) ?? nowMs, nowMs) : null,
      at: r.started_at,
      href: `/ai-rop/calls/${r.id}`,
    })
  }

  // ── 3. Расхождения с CRM ──
  for (const d of discrepancyRows) {
    const label = d.field_label || d.field_name
    items.push({
      id: `disc:${d.id}`,
      category: "discrepancy",
      urgent: d.severity === "high",
      text: `${label}: в карточке «${d.card_value || "пусто"}», в разговоре прозвучало «${d.suggested_value || "—"}» — стоит сверить.`,
      managerName: d.manager_name,
      daysAgo: d.created_at ? daysBetween(toMs(d.created_at) ?? nowMs, nowMs) : null,
      at: d.created_at,
      href: "/ai-rop/discrepancies",
    })
  }

  // ── 6. Провалы по чек-листу (общекомандные, не привязаны к дате конкретного события) ──
  const PASS_THRESHOLD = 0.7
  const MIN_SAMPLES = 5
  const itemStats = new Map<string, { title: string; sum: number; n: number; passed: number }>()
  for (const r of checklistRows) {
    const arr = Array.isArray(r.checklist_scores_json)
      ? (r.checklist_scores_json as Array<{ id?: string; title?: string; score?: number }>)
      : []
    for (const it of arr) {
      const key = it.id || it.title
      if (!key || typeof it.score !== "number") continue
      const cur = itemStats.get(key) ?? { title: it.title || key, sum: 0, n: 0, passed: 0 }
      cur.sum += it.score
      cur.n += 1
      if (it.score >= PASS_THRESHOLD) cur.passed += 1
      itemStats.set(key, cur)
    }
  }
  const worstChecklist = [...itemStats.entries()]
    .map(([id, s]) => ({ id, title: s.title, passRate: s.n ? s.passed / s.n : 0, n: s.n }))
    .filter((s) => s.n >= MIN_SAMPLES && s.passRate < 0.5)
    .sort((a, b) => a.passRate - b.passRate)
    .slice(0, 5)
  for (const c of worstChecklist) {
    items.push({
      id: `checklist:${c.id}`,
      category: "checklist_gap",
      urgent: false,
      text: `Пункт чек-листа «${c.title}» выполняется только в ${Math.round(c.passRate * 100)}% звонков (${c.n} оценок) — вся команда, стоит разобрать на планёрке.`,
      managerName: null,
      daysAgo: null,
      at: null,
      href: "/ai-rop#slabye-mesta",
    })
  }

  // ── Фильтр по периоду (событие, к которому относится точка внимания) ──
  const filtered = items.filter((it) => withinPeriod(it.at, opts.from, opts.to) || it.category === "checklist_gap")

  filtered.sort((a, b) => {
    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1
    return (b.daysAgo ?? -1) - (a.daysAgo ?? -1)
  })

  const byCategory = Object.fromEntries(
    ATTENTION_CATEGORY_ORDER.map((cat) => [cat, filtered.filter((i) => i.category === cat)])
  ) as Record<AttentionCategory, AttentionItem[]>

  return {
    items: filtered,
    byCategory,
    total: filtered.length,
    urgentCount: filtered.filter((i) => i.urgent).length,
    silenceDays: settings.silenceDays,
    weakScoreThreshold: settings.weakCallScoreThreshold,
  }
}
