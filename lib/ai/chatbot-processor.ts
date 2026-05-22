// #15 Фазы 4-6: ядро AI-чат-бота. Обрабатывает одно входящее сообщение.
//
// Поток:
//   1. Проверка стоп-слов — если найдено, перевод в rejected без AI-вызова.
//   2. Глобальная quota (ai_chatbot_quota): INSERT ... ON CONFLICT increment.
//      Превышение → эскалация HR + notification, без AI.
//   3. Защита от петель: если последний ответ < 60 секунд → skipped (handled).
//   4. Защита от спама кандидата: > 10 сообщений за час → эскалация.
//   5. Лимит сообщений на кандидата за день → эскалация.
//   6. Intent classifier (Haiku) → category + confidence.
//   7. Решения: low confidence | out_of_scope | rejection_signal → эскалация.
//   8. Generator (Sonnet) — отвечает.
//   9. Запись в ai_chatbot_messages + notification HR при эскалации.

import { and, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates } from "@/lib/db/schema"
import { callClaudeHaiku, callClaudeSonnet } from "@/lib/ai/client"
import { matchStopWord } from "@/lib/followup/stop-words"
import { createNotification } from "@/lib/notifications"
import { sendTelegramAlert } from "@/lib/notifications/telegram"

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

export interface ProcessVacancy {
  id:                string
  title:             string | null
  companyId:         string
  aiChatbotEnabled?: boolean | null
  aiChatbotSettings: unknown
  aiChatbotPrompt:   string | null
}

export interface ProcessInput {
  candidateId: string
  vacancyId:   string
  incomingText: string
  vacancy:     ProcessVacancy
}

export interface ProcessResult {
  /** true = AI-агент взял на себя обработку этого сообщения. Сторона-вызывающая
   *  не должна запускать legacy-классификацию (rejection / wants_contact). */
  handled:          boolean
  action:           "sent" | "escalated" | "rejected" | "skipped"
  reply?:           string
  category?:        IntentCategory
  confidence?:      number
  escalationReason?: string
}

const TRIGGER_TO_CATEGORY: Record<string, IntentCategory> = {
  salary:              "salary",
  schedule:            "schedule",
  location:            "location",
  requirements:        "requirements",
  callRequest:         "call_request",
  demoCheckIn:         "demo_check_in",
  interviewScheduling: "interview_scheduling",
}

const ESCALATION_REASON_LABEL: Record<string, string> = {
  stop_word:             "Стоп-слово в сообщении",
  global_quota_exceeded: "Дневной лимит компании исчерпан",
  ping_pong_pause:       "Пауза антипетли",
  spam_flood:            "Кандидат шлёт слишком часто (>10 за час)",
  daily_limit:           "Дневной лимит сообщений кандидату",
  low_confidence:        "AI не уверен в ответе",
  not_in_triggers:       "Категория не включена в триггеры",
  rejection_signal:      "Кандидат отказался",
  empty_reply:           "AI вернул пустой ответ",
}

function getQuotaLimit(): number {
  const v = parseInt(process.env.AI_CHATBOT_DAILY_LIMIT ?? "1000", 10)
  return Number.isFinite(v) && v > 0 ? v : 1000
}

async function checkAndIncrementQuota(
  companyId: string,
): Promise<{ ok: boolean; current: number; limit: number }> {
  const limit = getQuotaLimit()
  const today = new Date().toISOString().slice(0, 10)
  await db.execute(sql`
    INSERT INTO ai_chatbot_quota (company_id, date, count)
    VALUES (${companyId}::uuid, ${today}::date, 1)
    ON CONFLICT (company_id, date) DO UPDATE SET count = ai_chatbot_quota.count + 1
  `)
  const rows = (await db.execute(sql`
    SELECT count FROM ai_chatbot_quota
    WHERE company_id = ${companyId}::uuid AND date = ${today}::date
  `)) as unknown as Array<{ count: number }>
  const current = Number(rows?.[0]?.count ?? 0)
  return { ok: current <= limit, current, limit }
}

async function dailyMessagesForCandidate(candidateId: string): Promise<number> {
  const today = new Date().toISOString().slice(0, 10)
  const rows = (await db.execute(sql`
    SELECT count(*)::int AS c FROM ai_chatbot_messages
    WHERE candidate_id = ${candidateId}::uuid
      AND DATE(created_at) = ${today}::date
      AND sent_at IS NOT NULL
  `)) as unknown as Array<{ c: number }>
  return Number(rows?.[0]?.c ?? 0)
}

async function hourlyIncomingForCandidate(candidateId: string): Promise<number> {
  const rows = (await db.execute(sql`
    SELECT count(*)::int AS c FROM ai_chatbot_messages
    WHERE candidate_id = ${candidateId}::uuid
      AND created_at >= NOW() - INTERVAL '1 hour'
  `)) as unknown as Array<{ c: number }>
  return Number(rows?.[0]?.c ?? 0)
}

async function lastReplyAt(candidateId: string): Promise<Date | null> {
  const rows = (await db.execute(sql`
    SELECT sent_at FROM ai_chatbot_messages
    WHERE candidate_id = ${candidateId}::uuid AND sent_at IS NOT NULL
    ORDER BY sent_at DESC LIMIT 1
  `)) as unknown as Array<{ sent_at: string }>
  return rows?.[0]?.sent_at ? new Date(rows[0].sent_at) : null
}

async function logMessage(args: {
  candidateId: string; vacancyId: string; incoming: string
  category: IntentCategory; confidence: number
  reply: string | null; sent: boolean; escalated: boolean; reason: string | null
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

interface CandidateInfo { name: string; shortId: string | null; token: string }
async function loadCandidate(candidateId: string): Promise<CandidateInfo | null> {
  const [c] = await db
    .select({ name: candidates.name, shortId: candidates.shortId, token: candidates.token })
    .from(candidates)
    .where(eq(candidates.id, candidateId))
    .limit(1)
  if (!c) return null
  return { name: c.name, shortId: c.shortId, token: c.token }
}

async function escalate(args: {
  companyId:        string
  vacancyId:        string
  vacancyTitle:     string
  candidateId:      string
  candidateInfo:    CandidateInfo | null
  incomingMessage:  string
  reason:           keyof typeof ESCALATION_REASON_LABEL | string
  category?:        IntentCategory
  confidence?:      number
  threshold?:       number
  telegramChannel?: string
  severity?:        "info" | "warning" | "danger" | "success"
  notificationType?: string
}) {
  const candName = args.candidateInfo?.name ?? "Кандидат"
  const tokenForUrl = args.candidateInfo?.shortId ?? args.candidateInfo?.token ?? args.candidateId
  const href = `/hr/vacancies/${args.vacancyId}?candidate=${tokenForUrl}`
  const label = ESCALATION_REASON_LABEL[args.reason] ?? args.reason
  const preview = args.incomingMessage.length > 200
    ? args.incomingMessage.slice(0, 200) + "…"
    : args.incomingMessage

  const title = `🤖 AI-агент эскалирует: ${candName} (${args.vacancyTitle})`
  const confLine = typeof args.confidence === "number"
    ? `\nУверенность: ${args.confidence.toFixed(2)}${args.threshold != null ? ` (порог ${args.threshold.toFixed(2)})` : ""}`
    : ""
  const catLine = args.category ? `\nКатегория: ${args.category}` : ""
  const body = `Причина: ${label}${catLine}${confLine}\nСообщение кандидата: «${preview}»`

  await createNotification({
    tenantId:   args.companyId,
    type:       args.notificationType ?? "ai_chatbot_escalation",
    title,
    body,
    severity:   args.severity ?? "warning",
    href,
    sourceType: "ai_chatbot",
    sourceId:   args.candidateId,
  })

  if (args.telegramChannel) {
    const link = `https://company24.pro${href}`
    const tgText =
      `🤖 <b>AI-агент эскалирует кандидата</b>\n\n` +
      `<b>Вакансия:</b> ${args.vacancyTitle}\n` +
      `<b>Кандидат:</b> ${candName}\n` +
      `<b>Причина:</b> ${label}${args.category ? ` (${args.category})` : ""}${confLine}\n` +
      `<b>Сообщение:</b> «${preview}»\n\n` +
      `<a href="${link}">Открыть карточку</a>`
    await sendTelegramAlert(args.telegramChannel, tgText).catch(() => {})
  }
}

export async function processChatbotMessage(input: ProcessInput): Promise<ProcessResult> {
  const { candidateId, vacancyId, incomingText, vacancy } = input
  const settings = (vacancy.aiChatbotSettings ?? {}) as ChatbotSettings
  const prompt = vacancy.aiChatbotPrompt ?? ""
  const companyId = vacancy.companyId
  const vacancyTitle = vacancy.title ?? "—"
  const telegramChannel = settings.telegramChannel?.trim() || undefined

  const threshold = typeof settings.confidenceThreshold === "number" ? settings.confidenceThreshold : 0.7
  const dailyLimit = typeof settings.dailyMessageLimit === "number" ? settings.dailyMessageLimit : 5
  const stopwordsOn = settings.stopWordsOverride !== false

  // Защита: бот не должен трогать остановленных / финальных кандидатов.
  const [c] = await db
    .select({
      stage: candidates.stage,
      stopped: candidates.autoProcessingStopped,
    })
    .from(candidates)
    .where(eq(candidates.id, candidateId))
    .limit(1)
  if (!c) return { handled: false, action: "skipped", escalationReason: "candidate_missing" }
  if (c.stopped || c.stage === "rejected" || c.stage === "hired") {
    return { handled: false, action: "skipped", escalationReason: "candidate_inactive" }
  }

  const candidateInfo = await loadCandidate(candidateId)

  // 1. Стоп-слова перебивают AI: rejected без AI-вызова.
  if (stopwordsOn && matchStopWord(incomingText)) {
    await db.update(candidates).set({
      stage: "rejected",
      autoProcessingStopped: true,
      autoProcessingStoppedReason: "stop_word_in_chat",
      autoProcessingStoppedAt: new Date(),
      automationPaused: true,
      updatedAt: new Date(),
    }).where(eq(candidates.id, candidateId))
    await logMessage({
      candidateId, vacancyId, incoming: incomingText,
      category: "rejection_signal", confidence: 1,
      reply: null, sent: false, escalated: false, reason: "stop_word",
    })
    return { handled: true, action: "rejected", category: "rejection_signal", confidence: 1, escalationReason: "stop_word" }
  }

  // 2. Глобальная quota
  const quota = await checkAndIncrementQuota(companyId)
  if (!quota.ok) {
    await logMessage({
      candidateId, vacancyId, incoming: incomingText,
      category: "other", confidence: 0,
      reply: null, sent: false, escalated: true, reason: "global_quota_exceeded",
    })
    await escalate({
      companyId, vacancyId, vacancyTitle, candidateId, candidateInfo,
      incomingMessage: incomingText, reason: "global_quota_exceeded",
      telegramChannel, severity: "danger",
      notificationType: "ai_chatbot_escalation_limit",
    })
    return { handled: true, action: "escalated", escalationReason: "global_quota_exceeded" }
  }

  // 3. Защита от петель: 60-секундный cooldown между ответами AI.
  const last = await lastReplyAt(candidateId)
  if (last && Date.now() - last.getTime() < 60_000) {
    return { handled: true, action: "skipped", escalationReason: "ping_pong_pause" }
  }

  // 4. Защита от спама/бота: > 10 сообщений за последний час → эскалация.
  const hourly = await hourlyIncomingForCandidate(candidateId)
  if (hourly >= 10) {
    await logMessage({
      candidateId, vacancyId, incoming: incomingText,
      category: "other", confidence: 0,
      reply: null, sent: false, escalated: true, reason: "spam_flood",
    })
    await escalate({
      companyId, vacancyId, vacancyTitle, candidateId, candidateInfo,
      incomingMessage: incomingText, reason: "spam_flood",
      telegramChannel, severity: "warning",
    })
    return { handled: true, action: "escalated", escalationReason: "spam_flood" }
  }

  // 5. Лимит сообщений на кандидата в день.
  const todayCnt = await dailyMessagesForCandidate(candidateId)
  if (todayCnt >= dailyLimit) {
    await logMessage({
      candidateId, vacancyId, incoming: incomingText,
      category: "other", confidence: 0,
      reply: null, sent: false, escalated: true, reason: "daily_limit",
    })
    await escalate({
      companyId, vacancyId, vacancyTitle, candidateId, candidateInfo,
      incomingMessage: incomingText, reason: "daily_limit",
      telegramChannel, severity: "info",
    })
    return { handled: true, action: "escalated", escalationReason: "daily_limit" }
  }

  // 6. Intent classifier
  let category: IntentCategory = "other"
  let confidence = 0
  try {
    const cls = await classifyIntent(incomingText)
    category = cls.category
    confidence = cls.confidence
  } catch (err) {
    console.warn("[chatbot] intent classifier failed:", err)
    await logMessage({
      candidateId, vacancyId, incoming: incomingText,
      category: "other", confidence: 0,
      reply: null, sent: false, escalated: true, reason: "classifier_error",
    })
    await escalate({
      companyId, vacancyId, vacancyTitle, candidateId, candidateInfo,
      incomingMessage: incomingText, reason: "classifier_error",
      telegramChannel, severity: "warning",
      notificationType: "ai_chatbot_escalation_error",
    })
    return { handled: true, action: "escalated", escalationReason: "classifier_error" }
  }

  // 7. Решение
  if (category === "rejection_signal") {
    await logMessage({
      candidateId, vacancyId, incoming: incomingText,
      category, confidence,
      reply: null, sent: false, escalated: false, reason: "rejection_signal",
    })
    return { handled: true, action: "rejected", category, confidence, escalationReason: "rejection_signal" }
  }
  if (confidence < threshold) {
    await logMessage({
      candidateId, vacancyId, incoming: incomingText,
      category, confidence,
      reply: null, sent: false, escalated: true, reason: "low_confidence",
    })
    await escalate({
      companyId, vacancyId, vacancyTitle, candidateId, candidateInfo,
      incomingMessage: incomingText, reason: "low_confidence",
      category, confidence, threshold,
      telegramChannel, severity: "warning",
      notificationType: "ai_chatbot_escalation_low_confidence",
    })
    return { handled: true, action: "escalated", category, confidence, escalationReason: "low_confidence" }
  }
  const triggerKey = (Object.keys(TRIGGER_TO_CATEGORY) as Array<keyof typeof TRIGGER_TO_CATEGORY>)
    .find(k => TRIGGER_TO_CATEGORY[k] === category)
  if (!triggerKey || !settings.triggers?.[triggerKey]) {
    await logMessage({
      candidateId, vacancyId, incoming: incomingText,
      category, confidence,
      reply: null, sent: false, escalated: true, reason: "not_in_triggers",
    })
    await escalate({
      companyId, vacancyId, vacancyTitle, candidateId, candidateInfo,
      incomingMessage: incomingText, reason: "not_in_triggers",
      category, confidence, threshold,
      telegramChannel, severity: "info",
      notificationType: "ai_chatbot_escalation_out_of_scope",
    })
    return { handled: true, action: "escalated", category, confidence, escalationReason: "not_in_triggers" }
  }

  // 8. Generator
  if (!prompt?.trim()) {
    return { handled: false, action: "skipped", escalationReason: "no_prompt" }
  }
  let reply = ""
  try {
    reply = (await callClaudeSonnet(incomingText, prompt, 800)).trim()
  } catch (err) {
    console.warn("[chatbot] generator failed:", err)
  }
  if (!reply) {
    await logMessage({
      candidateId, vacancyId, incoming: incomingText,
      category, confidence,
      reply: null, sent: false, escalated: true, reason: "empty_reply",
    })
    await escalate({
      companyId, vacancyId, vacancyTitle, candidateId, candidateInfo,
      incomingMessage: incomingText, reason: "empty_reply",
      category, confidence, threshold,
      telegramChannel, severity: "warning",
      notificationType: "ai_chatbot_escalation_error",
    })
    return { handled: true, action: "escalated", category, confidence, escalationReason: "empty_reply" }
  }

  await logMessage({
    candidateId, vacancyId, incoming: incomingText,
    category, confidence,
    reply, sent: true, escalated: false, reason: null,
  })
  return { handled: true, action: "sent", reply, category, confidence }
}

// Удержание прежнего экспорта для обратной совместимости с уже написанными
// вызовами (если где-то ещё передают плоские поля).
export type LegacyProcessInput = {
  companyId: string; vacancyId: string; candidateId: string
  message: string; settings: ChatbotSettings; prompt: string
}
export async function processChatbotMessageLegacy(input: LegacyProcessInput): Promise<ProcessResult> {
  return processChatbotMessage({
    candidateId: input.candidateId,
    vacancyId:   input.vacancyId,
    incomingText: input.message,
    vacancy: {
      id:                input.vacancyId,
      title:             null,
      companyId:         input.companyId,
      aiChatbotEnabled:  true,
      aiChatbotSettings: input.settings,
      aiChatbotPrompt:   input.prompt,
    },
  })
}

// Suppress unused-import warning if `and` is not needed.
void and
