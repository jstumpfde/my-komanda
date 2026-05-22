// #15 Фазы 4-6: ядро AI-чат-бота. Обрабатывает одно входящее сообщение.
//
// Поток:
//   1. Проверка стоп-слов → если найдено и stopWordsOverride=true,
//      сразу перевод в rejected без AI-вызова.
//   2. Проверка глобальной quota (ai_chatbot_quota) → если превышена,
//      эскалация в Telegram, без AI.
//   3. Проверка лимита сообщений на кандидата за день → если превышен,
//      эскалация.
//   4. Защита от петель: если последний ответ AI этому кандидату был
//      < 60 секунд назад, ставим паузу 3 минуты (возвращаем skip).
//   5. Intent classifier (Haiku) → category + confidence.
//   6. Решение: low confidence | out_of_scope | rejection_signal → эскалация.
//   7. Generator (Sonnet) — генерирует ответ.
//   8. Запись в ai_chatbot_messages.

import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { callClaudeHaiku, callClaudeSonnet } from "@/lib/ai/client"
import { matchStopWord } from "@/lib/followup/stop-words"

export type IntentCategory =
  | "salary" | "schedule" | "location" | "requirements"
  | "call_request" | "demo_check_in" | "interview_scheduling"
  | "rejection_signal" | "other"

export interface ChatbotSettings {
  triggers?: Record<string, boolean>
  confidenceThreshold?: number
  dailyMessageLimit?: number
  stopWordsOverride?: boolean
  telegramChannel?: string
}

export interface ProcessInput {
  companyId:   string
  vacancyId:   string
  candidateId: string
  message:     string
  settings:    ChatbotSettings
  prompt:      string
}

export interface ProcessResult {
  action:    "sent" | "escalated" | "rejected" | "skipped"
  reply?:    string
  category?: IntentCategory
  confidence?: number
  escalationReason?: string
}

// Triggers map: settings.triggers ключи → categories
const TRIGGER_TO_CATEGORY: Record<string, IntentCategory> = {
  salary:              "salary",
  schedule:            "schedule",
  location:            "location",
  requirements:        "requirements",
  callRequest:         "call_request",
  demoCheckIn:         "demo_check_in",
  interviewScheduling: "interview_scheduling",
}

async function checkQuota(companyId: string): Promise<boolean> {
  // Глобальный лимит 1000/день/компания. INSERT ... ON CONFLICT increment.
  const today = new Date().toISOString().slice(0, 10)
  await db.execute(sql`
    INSERT INTO ai_chatbot_quota (company_id, date, count)
    VALUES (${companyId}::uuid, ${today}::date, 1)
    ON CONFLICT (company_id, date) DO UPDATE SET count = ai_chatbot_quota.count + 1
  `)
  const rows = await db.execute(sql`
    SELECT count FROM ai_chatbot_quota WHERE company_id = ${companyId}::uuid AND date = ${today}::date
  `) as unknown as Array<{ count: number }>
  const count = rows?.[0]?.count ?? 0
  return count <= 1000
}

async function dailyMessagesForCandidate(candidateId: string): Promise<number> {
  const today = new Date().toISOString().slice(0, 10)
  const rows = await db.execute(sql`
    SELECT count(*)::int AS c FROM ai_chatbot_messages
    WHERE candidate_id = ${candidateId}::uuid
      AND DATE(created_at) = ${today}::date
      AND sent_at IS NOT NULL
  `) as unknown as Array<{ c: number }>
  return rows?.[0]?.c ?? 0
}

async function lastReplyAt(candidateId: string): Promise<Date | null> {
  const rows = await db.execute(sql`
    SELECT sent_at FROM ai_chatbot_messages
    WHERE candidate_id = ${candidateId}::uuid AND sent_at IS NOT NULL
    ORDER BY sent_at DESC LIMIT 1
  `) as unknown as Array<{ sent_at: string }>
  return rows?.[0]?.sent_at ? new Date(rows[0].sent_at) : null
}

async function logMessage(args: {
  candidateId: string; vacancyId: string; incoming: string;
  category: IntentCategory; confidence: number;
  reply: string | null; sent: boolean; escalated: boolean;
  reason: string | null;
}) {
  await db.execute(sql`
    INSERT INTO ai_chatbot_messages
      (candidate_id, vacancy_id, incoming_message, intent_category, intent_confidence,
       generated_reply, sent_at, escalated_to_hr, escalation_reason)
    VALUES
      (${args.candidateId}::uuid, ${args.vacancyId}::uuid, ${args.incoming},
       ${args.category}, ${args.confidence},
       ${args.reply}, ${args.sent ? new Date().toISOString() : null},
       ${args.escalated}, ${args.reason})
  `)
}

async function classifyIntent(message: string): Promise<{ category: IntentCategory; confidence: number }> {
  const prompt = `Классифицируй сообщение кандидата:
"${message}"

Возможные категории:
- salary (вопрос о зарплате)
- schedule (вопрос о графике/часах работы)
- location (вопрос о локации/формате)
- requirements (вопрос об опыте/навыках/требованиях)
- call_request (просит позвонить или хочет звонок)
- demo_check_in (упоминает демо: «посмотрел», «изучил», «не успел»)
- interview_scheduling (хочет назначить интервью)
- rejection_signal (кандидат отказывается)
- other (что-то ещё)

Верни ТОЛЬКО JSON: { "category": "...", "confidence": 0.0-1.0 }
Без markdown.`
  const raw = await callClaudeHaiku(prompt, undefined, 200)
  const m = raw.match(/\{[\s\S]*\}/)
  if (!m) return { category: "other", confidence: 0 }
  try {
    const parsed = JSON.parse(m[0]) as { category?: string; confidence?: number }
    const cat = (parsed.category ?? "other") as IntentCategory
    const conf = Math.max(0, Math.min(1, Number(parsed.confidence) || 0))
    return { category: cat, confidence: conf }
  } catch {
    return { category: "other", confidence: 0 }
  }
}

export async function processChatbotMessage(input: ProcessInput): Promise<ProcessResult> {
  const { companyId, vacancyId, candidateId, message, settings, prompt } = input
  const threshold = typeof settings.confidenceThreshold === "number" ? settings.confidenceThreshold : 0.7
  const dailyLimit = typeof settings.dailyMessageLimit === "number" ? settings.dailyMessageLimit : 5
  const stopwords = settings.stopWordsOverride !== false

  // 1. Стоп-слова
  if (stopwords && matchStopWord(message)) {
    await logMessage({
      candidateId, vacancyId, incoming: message,
      category: "rejection_signal", confidence: 1,
      reply: null, sent: false, escalated: false, reason: "stop_word",
    })
    return { action: "rejected", escalationReason: "stop_word", category: "rejection_signal", confidence: 1 }
  }

  // 2. Глобальная quota
  const quotaOk = await checkQuota(companyId)
  if (!quotaOk) {
    await logMessage({
      candidateId, vacancyId, incoming: message,
      category: "other", confidence: 0,
      reply: null, sent: false, escalated: true, reason: "global_quota_exceeded",
    })
    return { action: "escalated", escalationReason: "global_quota_exceeded" }
  }

  // 3. Защита от петель: 3-минутная пауза если AI только что отвечал
  const last = await lastReplyAt(candidateId)
  if (last && (Date.now() - last.getTime()) < 60_000) {
    return { action: "skipped", escalationReason: "ping_pong_pause" }
  }

  // 4. Лимит на кандидата
  const todayCnt = await dailyMessagesForCandidate(candidateId)
  if (todayCnt >= dailyLimit) {
    await logMessage({
      candidateId, vacancyId, incoming: message,
      category: "other", confidence: 0,
      reply: null, sent: false, escalated: true, reason: "daily_limit",
    })
    return { action: "escalated", escalationReason: "daily_limit" }
  }

  // 5. Intent classifier
  const { category, confidence } = await classifyIntent(message)

  // 6. Решение
  if (category === "rejection_signal") {
    await logMessage({
      candidateId, vacancyId, incoming: message,
      category, confidence, reply: null, sent: false, escalated: false, reason: "rejection_signal",
    })
    return { action: "rejected", category, confidence }
  }
  if (confidence < threshold) {
    await logMessage({
      candidateId, vacancyId, incoming: message,
      category, confidence, reply: null, sent: false, escalated: true, reason: "low_confidence",
    })
    return { action: "escalated", category, confidence, escalationReason: "low_confidence" }
  }
  // Маппим category → trigger key и проверяем что включено
  const triggerKey = (Object.keys(TRIGGER_TO_CATEGORY) as Array<keyof typeof TRIGGER_TO_CATEGORY>)
    .find(k => TRIGGER_TO_CATEGORY[k] === category)
  if (!triggerKey || !settings.triggers?.[triggerKey]) {
    await logMessage({
      candidateId, vacancyId, incoming: message,
      category, confidence, reply: null, sent: false, escalated: true, reason: "not_in_triggers",
    })
    return { action: "escalated", category, confidence, escalationReason: "not_in_triggers" }
  }

  // 7. Generator
  const reply = (await callClaudeSonnet(message, prompt, 800)).trim()
  if (!reply) {
    await logMessage({
      candidateId, vacancyId, incoming: message,
      category, confidence, reply: null, sent: false, escalated: true, reason: "empty_reply",
    })
    return { action: "escalated", category, confidence, escalationReason: "empty_reply" }
  }

  await logMessage({
    candidateId, vacancyId, incoming: message,
    category, confidence, reply, sent: true, escalated: false, reason: null,
  })
  return { action: "sent", reply, category, confidence }
}
