/**
 * Данные для «Кабинета РОПа» — единый экран с приоритетными звонками и
 * свежими заметками аналитика для команды. Отдельный файл (не
 * dashboard-data.ts), т.к. это НЕ фильтруемый период-дашборд, а точечные
 * выборки «последние N часов/дней» независимо от календаря.
 *
 * Порт call-agent lib/rop-priority.ts 1:1 (callId — теперь uuid, а не int).
 */
import { sql } from "drizzle-orm"
import { db } from "@/lib/db"

// ──────────────────────────────────────────────────────────────────────
// «Требует внимания» — риск-скор по звонкам за последние 48 часов

export interface RopPriorityCall {
  callId: string
  managerId: string
  managerName: string
  startedAt: string
  managerScore: number | null
  sentiment: "positive" | "neutral" | "negative" | null
  summary: string | null
  hasBitrixDeal: boolean
  risk: number
}

interface PriorityRow {
  call_id: string
  manager_id: string
  manager_name: string | null
  started_at: string
  manager_score: number | null
  sentiment: "positive" | "neutral" | "negative" | null
  summary: string | null
  bitrix_deal_id: string | null
  risk: number
}

/**
 * Топ-10 звонков за последние 48 часов по риск-скору:
 *   risk = (10 - manager_score) + (негатив: +3) + (есть сделка в Bitrix: +2)
 * Учитывает те же исключения менеджеров, что и остальной дашборд
 * (is_active / excluded_from_reports).
 */
export async function getRopPriorityCalls(tenantId: string, limit = 10): Promise<RopPriorityCall[]> {
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000)

  const rows = (await db.execute(sql`
    SELECT c.id AS call_id, c.manager_id AS manager_id,
           COALESCE(NULLIF(c.manager_name, ''), m.name, '') AS manager_name,
           c.started_at::text AS started_at,
           a.manager_score AS manager_score, a.sentiment AS sentiment, a.summary AS summary,
           c.bitrix_deal_id AS bitrix_deal_id,
           ((10 - COALESCE(a.manager_score, 5))
             + (CASE WHEN a.sentiment = 'negative' THEN 3 ELSE 0 END)
             + (CASE WHEN c.bitrix_deal_id IS NOT NULL THEN 2 ELSE 0 END))::float8 AS risk
    FROM rop_analyses a
    JOIN rop_calls c ON c.id = a.call_id
    LEFT JOIN rop_managers m ON m.tenant_id = c.tenant_id AND m.bitrix_manager_id = c.manager_id
    WHERE c.tenant_id = ${tenantId}::uuid
      AND c.started_at >= ${since.toISOString()}::timestamptz
      AND c.manager_id IS NOT NULL AND c.manager_id <> ''
      AND (m.is_active IS NULL OR m.is_active = true)
      AND (m.excluded_from_reports IS NULL OR m.excluded_from_reports = false)
    ORDER BY risk DESC, c.started_at DESC
    LIMIT ${limit}
  `)) as unknown as PriorityRow[]

  return rows.map((r) => ({
    callId: r.call_id,
    managerId: r.manager_id,
    managerName: r.manager_name || `ID ${r.manager_id}`,
    startedAt: r.started_at,
    managerScore: r.manager_score != null ? Number(r.manager_score) : null,
    sentiment: r.sentiment,
    summary: r.summary,
    hasBitrixDeal: !!r.bitrix_deal_id,
    risk: Number(r.risk),
  }))
}

// ──────────────────────────────────────────────────────────────────────
// «Свежие заметки по команде» — rop_notes_json за последние 7 дней

export interface RopNoteEntry {
  callId: string
  startedAt: string
  text: string
}

export interface RopManagerNotes {
  managerId: string
  managerName: string
  notes: RopNoteEntry[] // отсортированы по свежести, максимум 2
}

interface NotesRow {
  call_id: string
  manager_id: string
  manager_name: string | null
  started_at: string
  rop_notes_json: unknown
}

/**
 * Последние 20 звонков (за 7 дней) с непустыми rop_notes_json — прямая честная
 * оценка аналитика для РОПа (в отличие от coaching_tips_json — это советы
 * менеджеру, мягкий тон). Группируем по менеджеру, показываем 1-2 самых
 * свежих заметки на каждого.
 */
export async function getRopTeamNotes(tenantId: string): Promise<RopManagerNotes[]> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const rows = (await db.execute(sql`
    SELECT c.id AS call_id, c.manager_id AS manager_id,
           COALESCE(NULLIF(c.manager_name, ''), m.name, '') AS manager_name,
           c.started_at::text AS started_at, a.rop_notes_json AS rop_notes_json
    FROM rop_analyses a
    JOIN rop_calls c ON c.id = a.call_id
    LEFT JOIN rop_managers m ON m.tenant_id = c.tenant_id AND m.bitrix_manager_id = c.manager_id
    WHERE c.tenant_id = ${tenantId}::uuid
      AND c.started_at >= ${since.toISOString()}::timestamptz
      AND a.rop_notes_json IS NOT NULL AND jsonb_array_length(a.rop_notes_json) > 0
      AND c.manager_id IS NOT NULL AND c.manager_id <> ''
      AND (m.is_active IS NULL OR m.is_active = true)
      AND (m.excluded_from_reports IS NULL OR m.excluded_from_reports = false)
    ORDER BY c.started_at DESC
    LIMIT 20
  `)) as unknown as NotesRow[]

  const byManager = new Map<string, RopManagerNotes>()
  for (const r of rows) {
    const notes = Array.isArray(r.rop_notes_json) ? (r.rop_notes_json as unknown[]) : []
    if (!notes.length) continue

    const entry = byManager.get(r.manager_id) ?? {
      managerId: r.manager_id,
      managerName: r.manager_name || `ID ${r.manager_id}`,
      notes: [],
    }
    for (const raw of notes) {
      const text = String(raw ?? "").trim()
      if (text.length <= 5) continue
      if (entry.notes.length >= 2) break // максимум 2 самых свежих на менеджера
      entry.notes.push({ callId: r.call_id, startedAt: r.started_at, text })
    }
    byManager.set(r.manager_id, entry)
  }

  // Сортируем менеджеров по свежести их самой новой заметки (rows уже DESC по дате,
  // поэтому первое вхождение в byManager — самое свежее).
  return [...byManager.values()].filter((m) => m.notes.length > 0)
}
