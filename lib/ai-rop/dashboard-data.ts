/**
 * Все SQL-выборки для дашборда AI-РОП — в одном месте, используются и в
 * приватном кабинете (/ai-rop), и в публичном отчёте (/rop-report/[token]).
 *
 * Порт call-agent lib/dashboard-data.ts (09.07, оптимизация — 11 запросов в
 * одном Promise.all вместо последовательных await, сохранена). Отличия от
 * оригинала: SQLite-совместимость убрана (прод только PG), *_json колонки —
 * jsonb (driver отдаёт уже распарсенные JS-значения, JSON.parse не нужен),
 * tenantId — uuid (companies.id) вместо bigint.
 *
 * КАЖДЫЙ запрос обязан фильтроваться по tenantId — без исключений (см.
 * инвариант мультитенантности в задаче переноса).
 */
import { sql, eq, type SQL } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropSettings } from "@/lib/db/schema"

const DEFAULT_CONTACT_THRESHOLD = 15

export type SentimentBucket = "positive" | "neutral" | "negative" | "unknown"

export interface DashboardDataOpts {
  tenantId: string
  /** ISO YYYY-MM-DD — нижняя граница периода (по started_at) */
  from?: string
  /** ISO YYYY-MM-DD — верхняя граница */
  to?: string
  /** Фильтр «только звонки привязанные к Deal/Lead/Contact/Activity в CRM» */
  withCrmOnly?: boolean
  /** Фильтр по конкретному менеджеру (Bitrix manager_id) */
  managerId?: string
  /**
   * Если задан — это RLS-режим для роли manager: видит только свои звонки.
   * В этом случае фильтр по managerId игнорируется (RLS уже жёсткая).
   */
  managerBitrixId?: string
}

export interface DailyRow {
  day: string
  total: number
  positive: number
  negative: number
  neutral: number
}

export interface ManagerStatsRow {
  manager_id: string
  manager_name: string
  calls: number
  connected: number
  missed: number
  total_seconds: number
  contact_seconds: number
  incoming: number
  outgoing: number
  avg_score: number | null
  avg_compliance: number | null
  pos: number
  neu: number
  neg: number
}

export interface ProductStatsRow {
  product: string | null
  calls: number
  connected: number
  missed: number
  total_seconds: number
  avg_score: number | null
  avg_compliance: number | null
  pos: number
  neu: number
  neg: number
}

export interface DashboardData {
  contactThreshold: number
  missedThreshold: number
  totals: {
    total: number; done: number; in_progress: number; failed: number
    no_recording: number; incoming: number; outgoing: number
    avg_duration: number; total_duration: number
  }
  aggs: { avg_score: number | null; avg_compliance: number | null }
  sentMap: Record<SentimentBucket, number>
  sentTotal: number
  allManagers: ManagerStatsRow[]
  series: DailyRow[]
  maxDaily: number
  topObjections: Array<{ title: string; count: number }>
  topTopics: Array<{ title: string; count: number }>
  productStats: ProductStatsRow[]
  checklistStats: Array<{ id: string; title: string; avg: number; n: number }>
  /**
   * Детальный разрез по пунктам чек-листа: средний score, % выполнения
   * (score >= 0.7), кол-во оценок. Учитывает все активные фильтры дашборда
   * (период / менеджер / with_crm). Отсортирован по pass_rate ASC — сверху
   * худшие.
   */
  checklistItemsBreakdown: Array<{
    id: string
    title: string
    avg_score: number
    pass_rate: number
    count: number
  }>
  /** Список менеджеров тенанта — для фильтра. Пустой в RLS-режиме менеджера. */
  managersList: Array<{ id: string; name: string }>
  /**
   * ФИО менеджера, выбранного фильтром (или RLS-менеджера в режиме manager).
   * `null`, если выбрана вся команда.
   */
  selectedManagerName: string | null
}

/** Порог «контактного» звонка (сек) — per-company настройка в rop_settings.settings.contactThresholdSeconds. */
async function getContactThresholdSeconds(tenantId: string): Promise<number> {
  const [row] = await db
    .select({ settings: ropSettings.settings })
    .from(ropSettings)
    .where(eq(ropSettings.companyId, tenantId))
    .limit(1)
  const raw = (row?.settings as Record<string, unknown> | null)?.contactThresholdSeconds
  const n = typeof raw === "number" ? raw : parseInt(String(raw ?? ""), 10)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_CONTACT_THRESHOLD
}

/**
 * Базовый WHERE — tenant + (опц.) менеджер + (опц.) дата + (опц.) CRM-only.
 * includeDate=false используется для блоков, которые НЕ зависят от периода
 * в календаре (сейчас — «Динамика 14 дней», см. loadDashboardData).
 */
function baseWhere(opts: DashboardDataOpts, includeDate: boolean): SQL {
  const parts: SQL[] = [sql`c.tenant_id = ${opts.tenantId}::uuid`]
  if (opts.managerBitrixId) {
    parts.push(sql`c.manager_id = ${opts.managerBitrixId}`)
  } else if (opts.managerId) {
    parts.push(sql`c.manager_id = ${opts.managerId}`)
  }
  if (includeDate) {
    if (opts.from) parts.push(sql`substr(c.started_at::text, 1, 10) >= ${opts.from}`)
    if (opts.to)   parts.push(sql`substr(c.started_at::text, 1, 10) <= ${opts.to}`)
  }
  if (opts.withCrmOnly) {
    parts.push(sql`(c.bitrix_deal_id IS NOT NULL OR c.bitrix_lead_id IS NOT NULL OR c.bitrix_contact_id IS NOT NULL OR (c.bitrix_activity_id IS NOT NULL AND c.bitrix_activity_id <> '0'))`)
  }
  return sql.join(parts, sql` AND `)
}

export async function loadDashboardData(opts: DashboardDataOpts): Promise<DashboardData> {
  const contactThreshold = await getContactThresholdSeconds(opts.tenantId)
  const missedThreshold = Math.max(5, Math.floor(contactThreshold / 1.5))

  const where = baseWhere(opts, true)
  const whereNoDate = baseWhere(opts, false)
  const selectedMgrId = opts.managerBitrixId || opts.managerId || null

  // ── Независимые SQL-запросы дашборда — ни один не читает результат
  // другого, поэтому гоняем их параллельно вместо последовательных await
  // (оптимизация из оригинала, 09.07 — сохранена).
  const [
    managersListRaw,
    totalsRows,
    aggsRows,
    sentimentRows,
    allManagersRows,
    dailyRows,
    rawObj,
    rawTopics,
    productStatsRows,
    rawChecklist,
    selectedManagerRows,
  ] = await Promise.all([
    // ── managersList ── (для не-manager-режима)
    opts.managerBitrixId
      ? Promise.resolve([] as Array<{ id: string; name: string }>)
      : (db.execute(sql`
          SELECT c.manager_id AS id,
                 COALESCE(MAX(c.manager_name), MAX(m.name), '') AS name
          FROM rop_calls c
          LEFT JOIN rop_managers m ON m.tenant_id = c.tenant_id AND m.bitrix_manager_id = c.manager_id
          WHERE c.tenant_id = ${opts.tenantId}::uuid
            AND c.manager_id IS NOT NULL AND c.manager_id <> ''
            AND (m.is_active IS NULL OR m.is_active = true)
            AND (m.excluded_from_reports IS NULL OR m.excluded_from_reports = false)
          GROUP BY c.manager_id
          ORDER BY name
        `) as unknown as Promise<Array<{ id: string; name: string }>>),

    // ── KPI ──
    db.execute(sql`
      SELECT
        COUNT(*)::int AS total,
        SUM(CASE WHEN c.status='done' THEN 1 ELSE 0 END)::int AS done,
        SUM(CASE WHEN c.status IN ('pending','downloading','transcribing','analyzing','syncing') THEN 1 ELSE 0 END)::int AS in_progress,
        SUM(CASE WHEN c.status='failed' THEN 1 ELSE 0 END)::int AS failed,
        SUM(CASE WHEN c.status='no_recording' THEN 1 ELSE 0 END)::int AS no_recording,
        SUM(CASE WHEN c.direction='in' THEN 1 ELSE 0 END)::int AS incoming,
        SUM(CASE WHEN c.direction='out' THEN 1 ELSE 0 END)::int AS outgoing,
        COALESCE(AVG(c.duration_sec), 0)::float8 AS avg_duration,
        COALESCE(SUM(c.duration_sec), 0)::int AS total_duration
      FROM rop_calls c
      WHERE ${where}
    `) as unknown as Promise<Array<DashboardData["totals"]>>,

    db.execute(sql`
      SELECT AVG(a.manager_score)::float8 AS avg_score, AVG(a.script_compliance)::float8 AS avg_compliance
      FROM rop_analyses a JOIN rop_calls c ON c.id = a.call_id
      WHERE ${where}
    `) as unknown as Promise<Array<DashboardData["aggs"]>>,

    // ── Sentiment ──
    db.execute(sql`
      SELECT a.sentiment AS sentiment, COUNT(*)::int AS n
      FROM rop_analyses a JOIN rop_calls c ON c.id = a.call_id
      WHERE ${where}
      GROUP BY a.sentiment
    `) as unknown as Promise<Array<{ sentiment: string | null; n: number }>>,

    // ── Менеджеры — детальная статистика ──
    db.execute(sql`
      SELECT c.manager_id AS manager_id,
             COALESCE(MAX(c.manager_name), MAX(m.name), '') AS manager_name,
             COUNT(*)::int AS calls,
             SUM(CASE WHEN c.duration_sec >= ${contactThreshold} THEN 1 ELSE 0 END)::int AS connected,
             COALESCE(SUM(c.duration_sec), 0)::int AS total_seconds,
             COALESCE(SUM(CASE WHEN c.duration_sec >= ${contactThreshold} THEN c.duration_sec ELSE 0 END), 0)::int AS contact_seconds,
             SUM(CASE WHEN c.direction='in' AND c.duration_sec = 0 THEN 1 ELSE 0 END)::int AS missed,
             SUM(CASE WHEN c.direction='in' AND c.duration_sec > 0 THEN 1 ELSE 0 END)::int AS incoming,
             SUM(CASE WHEN c.direction='out' THEN 1 ELSE 0 END)::int AS outgoing,
             AVG(a.manager_score)::float8 AS avg_score,
             AVG(a.script_compliance)::float8 AS avg_compliance,
             SUM(CASE WHEN a.sentiment='positive' THEN 1 ELSE 0 END)::int AS pos,
             SUM(CASE WHEN a.sentiment='neutral'  THEN 1 ELSE 0 END)::int AS neu,
             SUM(CASE WHEN a.sentiment='negative' THEN 1 ELSE 0 END)::int AS neg
      FROM rop_calls c
      LEFT JOIN rop_analyses a ON a.call_id = c.id
      LEFT JOIN rop_managers m ON m.tenant_id = c.tenant_id AND m.bitrix_manager_id = c.manager_id
      WHERE c.manager_id IS NOT NULL AND c.manager_id <> ''
        AND (m.is_active IS NULL OR m.is_active = true)
        AND (m.excluded_from_reports IS NULL OR m.excluded_from_reports = false)
        AND ${where}
      GROUP BY c.manager_id
      ORDER BY calls DESC
    `) as unknown as Promise<ManagerStatsRow[]>,

    // ── Динамика по дням (14) ──
    // ВАЖНО: используем whereNoDate — динамика всегда показывает последние
    // 14 дней независимо от выбранного в календаре периода.
    db.execute(sql`
      SELECT substr(c.started_at::text, 1, 10) AS day,
             COUNT(*)::int AS total,
             SUM(CASE WHEN a.sentiment='positive' THEN 1 ELSE 0 END)::int AS positive,
             SUM(CASE WHEN a.sentiment='negative' THEN 1 ELSE 0 END)::int AS negative,
             SUM(CASE WHEN a.sentiment='neutral'  THEN 1 ELSE 0 END)::int AS neutral
      FROM rop_calls c LEFT JOIN rop_analyses a ON a.call_id = c.id
      WHERE c.started_at IS NOT NULL
        AND substr(c.started_at::text, 1, 10) >= (CURRENT_DATE - INTERVAL '13 day')::text
        AND ${whereNoDate}
      GROUP BY day ORDER BY day ASC
    `) as unknown as Promise<DailyRow[]>,

    // ── Топ возражений (сырые строки) ──
    db.execute(sql`
      SELECT a.objections_json AS objections_json
      FROM rop_analyses a JOIN rop_calls c ON c.id = a.call_id
      WHERE a.objections_json IS NOT NULL AND ${where}
      LIMIT 2000
    `) as unknown as Promise<Array<{ objections_json: unknown }>>,

    // ── Топ тем (сырые строки) ──
    db.execute(sql`
      SELECT a.topics_json AS topics_json
      FROM rop_analyses a JOIN rop_calls c ON c.id = a.call_id
      WHERE a.topics_json IS NOT NULL AND ${where}
      LIMIT 2000
    `) as unknown as Promise<Array<{ topics_json: unknown }>>,

    // ── Распределение по продуктам ──
    db.execute(sql`
      SELECT sub.product AS product, sub.calls AS calls, sub.connected AS connected,
             sub.missed AS missed, sub.total_seconds AS total_seconds,
             sub.avg_score AS avg_score, sub.avg_compliance AS avg_compliance,
             sub.pos AS pos, sub.neu AS neu, sub.neg AS neg
      FROM (
        SELECT
          CASE
            WHEN COALESCE(NULLIF(c.detected_product,''), NULLIF(a.detected_product,'')) IS NOT NULL
              THEN COALESCE(NULLIF(c.detected_product,''), NULLIF(a.detected_product,''))
            WHEN c.id IN (SELECT call_id FROM rop_transcripts WHERE text IS NOT NULL AND text <> '')
              THEN '__no_match__'
            ELSE '__no_transcript__'
          END AS product,
          COUNT(*)::int AS calls,
          SUM(CASE WHEN c.duration_sec >= ${contactThreshold} THEN 1 ELSE 0 END)::int AS connected,
          SUM(CASE WHEN c.duration_sec < ${missedThreshold} THEN 1 ELSE 0 END)::int AS missed,
          COALESCE(SUM(c.duration_sec), 0)::int AS total_seconds,
          AVG(a.manager_score)::float8 AS avg_score,
          AVG(a.script_compliance)::float8 AS avg_compliance,
          SUM(CASE WHEN a.sentiment='positive' THEN 1 ELSE 0 END)::int AS pos,
          SUM(CASE WHEN a.sentiment='neutral'  THEN 1 ELSE 0 END)::int AS neu,
          SUM(CASE WHEN a.sentiment='negative' THEN 1 ELSE 0 END)::int AS neg
        FROM rop_calls c
        LEFT JOIN rop_analyses a ON a.call_id = c.id
        LEFT JOIN rop_managers m ON m.tenant_id = c.tenant_id AND m.bitrix_manager_id = c.manager_id
        WHERE (m.is_active IS NULL OR m.is_active = true)
          AND ${where}
        GROUP BY 1
      ) sub
      ORDER BY
        CASE WHEN sub.product = '__no_transcript__' THEN 2 WHEN sub.product = '__no_match__' THEN 1 ELSE 0 END,
        sub.calls DESC
    `) as unknown as Promise<ProductStatsRow[]>,

    // ── Чек-лист: сырые строки (агрегация по пунктам ниже, в памяти) ──
    db.execute(sql`
      SELECT a.checklist_scores_json AS checklist_scores_json
      FROM rop_analyses a JOIN rop_calls c ON c.id = a.call_id
      WHERE a.checklist_scores_json IS NOT NULL AND ${where}
      LIMIT 2000
    `) as unknown as Promise<Array<{ checklist_scores_json: unknown }>>,

    // ── Имя выбранного менеджера (для подзаголовков блоков) ──
    selectedMgrId
      ? (db.execute(sql`
          SELECT COALESCE(MAX(c.manager_name), MAX(m.name), '') AS name
          FROM rop_calls c
          LEFT JOIN rop_managers m ON m.tenant_id = c.tenant_id AND m.bitrix_manager_id = c.manager_id
          WHERE c.tenant_id = ${opts.tenantId}::uuid AND c.manager_id = ${selectedMgrId}
        `) as unknown as Promise<Array<{ name: string }>>)
      : Promise.resolve([] as Array<{ name: string }>),
  ])

  const totals = totalsRows[0] ?? {
    total: 0, done: 0, in_progress: 0, failed: 0, no_recording: 0,
    incoming: 0, outgoing: 0, avg_duration: 0, total_duration: 0,
  }
  const aggs = aggsRows[0] ?? { avg_score: null, avg_compliance: null }

  const sentMap: Record<SentimentBucket, number> = { positive: 0, neutral: 0, negative: 0, unknown: 0 }
  for (const s of sentimentRows) sentMap[(s.sentiment as SentimentBucket) || "unknown"] = Number(s.n)
  const sentTotal = sentMap.positive + sentMap.neutral + sentMap.negative

  const series: DailyRow[] = []
  const today = new Date()
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i)
    const ds = d.toISOString().slice(0, 10)
    const row = dailyRows.find((r) => r.day === ds)
    series.push(row ?? { day: ds, total: 0, positive: 0, negative: 0, neutral: 0 })
  }
  const maxDaily = Math.max(1, ...series.map((s) => s.total))

  // ── Топ возражений — jsonb уже распарсен драйвером в JS-массив. ──
  const objCount = new Map<string, number>()
  for (const r of rawObj) {
    const arr = Array.isArray(r.objections_json) ? (r.objections_json as unknown[]) : []
    for (const o of arr) {
      const k = String(o ?? "").trim().toLowerCase()
      // Отсекаем мусор: пустые, одиночные буквы/символы (AI иногда возвращает
      // «Е», «Т», обрывки) — возражение это всегда фраза/слово ≥ 3 символов.
      if (!k || k.length < 3) continue
      objCount.set(k, (objCount.get(k) || 0) + 1)
    }
  }
  const topObjections = [...objCount.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([title, count]) => ({ title, count }))

  // ── Топ тем ──
  const topicCount = new Map<string, number>()
  for (const r of rawTopics) {
    const arr = Array.isArray(r.topics_json) ? (r.topics_json as unknown[]) : []
    for (const t of arr) {
      const k = String(t ?? "").trim().toLowerCase()
      if (!k || k.length < 3) continue
      topicCount.set(k, (topicCount.get(k) || 0) + 1)
    }
  }
  const topTopics = [...topicCount.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([title, count]) => ({ title, count }))

  // ── Чек-лист: агрегация по пунктам (id+title → avg score, pass_rate, n) ──
  const PASS_THRESHOLD = 0.7
  const itemStats = new Map<string, { title: string; sum: number; n: number; passed: number }>()
  for (const r of rawChecklist) {
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
  const checklistStats = [...itemStats.entries()]
    .map(([id, s]) => ({ id, title: s.title, avg: s.n ? s.sum / s.n : 0, n: s.n }))
    .sort((a, b) => a.avg - b.avg)
  const checklistItemsBreakdown = [...itemStats.entries()]
    .map(([id, s]) => ({
      id,
      title: s.title,
      avg_score: s.n ? s.sum / s.n : 0,
      pass_rate: s.n ? s.passed / s.n : 0,
      count: s.n,
    }))
    .sort((a, b) => a.pass_rate - b.pass_rate)

  const selectedManagerName: string | null = selectedMgrId
    ? (selectedManagerRows[0]?.name && selectedManagerRows[0].name.trim()) || `ID ${selectedMgrId}`
    : null

  return {
    contactThreshold,
    missedThreshold,
    totals: {
      total: Number(totals.total), done: Number(totals.done), in_progress: Number(totals.in_progress),
      failed: Number(totals.failed), no_recording: Number(totals.no_recording),
      incoming: Number(totals.incoming), outgoing: Number(totals.outgoing),
      avg_duration: Number(totals.avg_duration), total_duration: Number(totals.total_duration),
    },
    aggs: {
      avg_score: aggs.avg_score != null ? Number(aggs.avg_score) : null,
      avg_compliance: aggs.avg_compliance != null ? Number(aggs.avg_compliance) : null,
    },
    sentMap,
    sentTotal,
    allManagers: allManagersRows,
    series,
    maxDaily,
    topObjections,
    topTopics,
    productStats: productStatsRows,
    checklistStats,
    checklistItemsBreakdown,
    managersList: managersListRaw,
    selectedManagerName,
  }
}
