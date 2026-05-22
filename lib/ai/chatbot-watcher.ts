// #69 Watcher агент: независимый аудитор работы AI-чат-бота.
// Раз в час анализирует последние 50 ответов AI кандидатам по каждой
// компании и ищет паттерны проблем (overpromise / inconsistent / repetitive
// / offtopic_drift / confidence_mismatch). При находке создаёт notification
// type='ai_watcher_alert'.

import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { callClaudeSonnet } from "@/lib/ai/client"
import { createNotification } from "@/lib/notifications"

const SAMPLE_LIMIT = 50
// Escape clause: если "messages_json" получается слишком большим — режем
// до этого числа сообщений (по контракту фазы, не больше ~30k tokens).
const HARD_TRUNCATE_AT = 20

export type WatcherIssueType =
  | "overpromise" | "inconsistent" | "repetitive"
  | "offtopic_drift" | "confidence_mismatch"

export interface WatcherIssue {
  type:        WatcherIssueType | string
  severity:    "warning" | "critical"
  examples:    string[]
  description: string
}

export interface WatcherAuditResult {
  issues:  WatcherIssue[]
  summary: string
  /** Сколько сообщений вошло в выборку. */
  sampleSize: number
}

interface MessageRow {
  id:                 string
  incoming_message:   string
  intent_category:    string
  intent_confidence:  number
  generated_reply:    string | null
  sent_at:            string | null
  escalated_to_hr:    boolean
  escalation_reason:  string | null
  created_at:         string
}

async function loadRecentMessages(companyId: string, limit: number): Promise<MessageRow[]> {
  const rows = (await db.execute(sql`
    SELECT m.id, m.incoming_message, m.intent_category, m.intent_confidence,
           m.generated_reply, m.sent_at, m.escalated_to_hr, m.escalation_reason,
           m.created_at
    FROM ai_chatbot_messages m
    JOIN vacancies v ON v.id = m.vacancy_id
    WHERE v.company_id = ${companyId}::uuid
      AND m.created_at >= NOW() - INTERVAL '1 hour'
      AND m.generated_reply IS NOT NULL
    ORDER BY m.created_at DESC
    LIMIT ${limit}
  `)) as unknown as MessageRow[]
  return rows ?? []
}

function buildPrompt(messages: MessageRow[]): string {
  const truncated = messages.slice(0, HARD_TRUNCATE_AT)
  const payload = truncated.map(m => ({
    id:         m.id,
    in:         m.incoming_message.slice(0, 250),
    cat:        m.intent_category,
    conf:       m.intent_confidence,
    out:        (m.generated_reply ?? "").slice(0, 400),
    escalated:  m.escalated_to_hr,
  }))

  return `Ты — независимый аудитор AI-чат-бота. Раз в час анализируешь последние 50 ответов AI кандидатам и ищешь паттерны проблем:

1. OVERPROMISE — AI слишком «услужлив»
2. INCONSISTENT — одинаковые вопросы получают разные ответы у разных кандидатов
3. REPETITIVE — одинаковые ответы как мантра
4. OFFTOPIC_DRIFT — AI уходит в сторону от вакансии
5. CONFIDENCE_MISMATCH — AI был уверен (>0.85) но HR потом отверг кандидата
6. CLEAN — всё работает корректно

Анализируй данные ниже. Если найдены паттерны (≥3 случая) — верни severity warning/critical с конкретными примерами:

Данные за час:
${JSON.stringify(payload, null, 0)}

Верни СТРОГО JSON без markdown:
{
  "issues": [
    { "type": "...", "severity": "warning" | "critical", "examples": ["msg_id_1"], "description": "..." }
  ],
  "summary": "общая оценка"
}`
}

function parseAuditResponse(raw: string): { issues: WatcherIssue[]; summary: string } {
  const m = raw.match(/\{[\s\S]*\}/)
  if (!m) return { issues: [], summary: "parse_error" }
  try {
    const parsed = JSON.parse(m[0]) as { issues?: unknown; summary?: unknown }
    const issues = Array.isArray(parsed.issues)
      ? parsed.issues
          .map((x): WatcherIssue | null => {
            if (!x || typeof x !== "object") return null
            const o = x as Record<string, unknown>
            const type = typeof o.type === "string" ? o.type : ""
            const severity = o.severity === "critical" ? "critical" : "warning"
            const examples = Array.isArray(o.examples)
              ? o.examples.filter((e): e is string => typeof e === "string").slice(0, 10)
              : []
            const description = typeof o.description === "string" ? o.description.slice(0, 500) : ""
            if (!type && !description) return null
            return { type, severity, examples, description }
          })
          .filter((x): x is WatcherIssue => x !== null)
      : []
    const summary = typeof parsed.summary === "string" ? parsed.summary.slice(0, 500) : ""
    return { issues, summary }
  } catch {
    return { issues: [], summary: "parse_error" }
  }
}

export async function runWatcherAudit(companyId: string): Promise<WatcherAuditResult> {
  const messages = await loadRecentMessages(companyId, SAMPLE_LIMIT)
  console.log(`[watcher] company=${companyId} sample=${messages.length}`)
  if (messages.length === 0) {
    return { issues: [], summary: "Нет данных за последний час", sampleSize: 0 }
  }

  const prompt = buildPrompt(messages)
  let raw = ""
  try {
    raw = (await callClaudeSonnet(prompt, undefined, 1500)).trim()
  } catch (err) {
    console.warn("[watcher] sonnet failed:", err)
    return { issues: [], summary: "ai_error", sampleSize: messages.length }
  }

  const { issues, summary } = parseAuditResponse(raw)
  console.log(`[watcher] company=${companyId} issues=${issues.length} summary="${summary.slice(0, 80)}"`)

  for (const issue of issues) {
    const sev = issue.severity === "critical" ? "danger" : "warning"
    await createNotification({
      tenantId: companyId,
      type:     "ai_watcher_alert",
      title:    `🤖 AI-наблюдатель: ${issue.type}`,
      body:     `${issue.description}${issue.examples.length ? `\nПримеры: ${issue.examples.slice(0, 5).join(", ")}` : ""}`,
      severity: sev,
      sourceType: "ai_watcher",
    })
  }

  return { issues, summary, sampleSize: messages.length }
}

export async function listActiveCompaniesWithChatbot(): Promise<string[]> {
  const rows = (await db.execute(sql`
    SELECT DISTINCT v.company_id::text AS company_id
    FROM vacancies v
    WHERE v.ai_chatbot_enabled = true
  `)) as unknown as Array<{ company_id: string }>
  return (rows ?? []).map(r => r.company_id)
}
