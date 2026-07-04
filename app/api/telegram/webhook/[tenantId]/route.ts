import { NextRequest, NextResponse } from "next/server"
import { and, eq, gt } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies, users, telegramLinkCodes } from "@/lib/db/schema"
import { getClaudeMessagesUrl } from "@/lib/claude-proxy"
import { AI_MODEL_MAIN } from "@/lib/ai/models"
import { retrieveKnowledgeContext, type RetrievalMaterialRef } from "@/lib/knowledge/retrieval"
import { checkAiTokenLimit, logAiUsage } from "@/lib/knowledge/token-limits"
import { tgGetFile, tgDownloadFile } from "@/lib/telegram/candidate-bot"
import { transcribeVoice, isTelegramSttConfigured } from "@/lib/knowledge/telegram-voice"

// ─── Types ─────────────────────────────────────────────────────────────────

interface TelegramVoice {
  file_id: string
  file_size?: number
  duration?: number
}

interface TelegramMessage {
  message_id: number
  chat: { id: number; type: string }
  from?: { id: number; first_name?: string; username?: string }
  text?: string
  voice?: TelegramVoice
}

interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
}

type MaterialRef = RetrievalMaterialRef

interface ClaudeResponse {
  answer: string
  cited: MaterialRef[]
  inputTokens: number
  outputTokens: number
}

// ─── Telegram ──────────────────────────────────────────────────────────────

async function sendMessage(token: string, chatId: number, text: string) {
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
    })
  } catch (err) {
    console.error("[telegram multitenant] sendMessage failed", err)
  }
}

// ─── Knowledge base context ────────────────────────────────────────────────
// Ранжирование по релевантности вопросу (semantic RAG), общее с ai-search
// и публичным чатом — см. lib/knowledge/retrieval.ts. Раньше здесь был
// "сырой дамп" последних 10 материалов без ранжирования.

// ─── Claude ────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT =
  "Ты — AI-ассистент корпоративной базы знаний. Отвечай ТОЛЬКО на основе предоставленных материалов. " +
  "Если ответ есть — дай краткий ответ и укажи название материала в скобках. " +
  "Если не найден — скажи что не нашёл и предложи обратиться к руководителю. " +
  "Отвечай на русском, кратко, 2-4 предложения."

async function askClaude(question: string, context: string, materialsList: MaterialRef[]): Promise<ClaudeResponse | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  try {
    const res = await fetch(getClaudeMessagesUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: AI_MODEL_MAIN,
        thinking: { type: "disabled" },
        max_tokens: 1536, // запас под токенизатор Sonnet 5 (~+30%)
        system: SYSTEM_PROMPT,
        messages: [
          { role: "user", content: `Материалы компании:\n${context}\n\nВопрос: ${question}` },
        ],
      }),
    })
    if (!res.ok) {
      console.error("[telegram multitenant] Claude", res.status)
      return null
    }
    const data = await res.json() as {
      content?: { type: string; text?: string }[]
      usage?: { input_tokens?: number; output_tokens?: number }
    }
    const answer = data.content?.find((c) => c.type === "text")?.text?.trim() || ""
    if (!answer) return null
    const lowered = answer.toLowerCase()
    const cited = materialsList.filter((m) => m.name && lowered.includes(m.name.toLowerCase())).slice(0, 3)
    return {
      answer,
      cited,
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
    }
  } catch (err) {
    console.error("[telegram multitenant] Claude fetch failed", err)
    return null
  }
}

// ─── Handlers ──────────────────────────────────────────────────────────────

// Привязка по одноразовому коду (аудит 04.07: раньше привязывали по голому
// email без проверки владения — любой мог написать боту чужой email и
// увести чужую переписку с базой знаний). Код выдаётся ТОЛЬКО залогиненному
// пользователю в UI платформы (/knowledge-v2/settings), TTL 15 минут.
async function handleStart(token: string, tenantId: string, chatId: number, code: string) {
  const trimmed = code.trim()
  if (!/^\d{6}$/.test(trimmed)) {
    await sendMessage(
      token,
      chatId,
      "Код не найден или истёк. Получите новый код в настройках платформы (База знаний → Telegram-бот) и отправьте `/start КОД`.",
    )
    return
  }

  const [row] = await db
    .select({ userId: telegramLinkCodes.userId })
    .from(telegramLinkCodes)
    .where(and(eq(telegramLinkCodes.code, trimmed), gt(telegramLinkCodes.expiresAt, new Date())))
    .limit(1)

  if (!row) {
    await sendMessage(
      token,
      chatId,
      "Код не найден или истёк. Получите новый код в настройках платформы (База знаний → Telegram-бот) и отправьте `/start КОД`.",
    )
    return
  }

  // Проверяем, что код выдан пользователю ИМЕННО этой компании — код,
  // выданный в другом тенанте, не должен привязываться через чужого бота.
  const [user] = await db
    .select({ id: users.id, companyId: users.companyId })
    .from(users)
    .where(eq(users.id, row.userId))
    .limit(1)

  if (!user || user.companyId !== tenantId) {
    await sendMessage(token, chatId, "Код не найден или истёк. Получите новый код в настройках платформы и попробуйте снова.")
    return
  }

  await db
    .update(users)
    .set({ telegramChatId: String(chatId) })
    .where(eq(users.id, user.id))

  // Гасим код сразу — одноразовый.
  await db.delete(telegramLinkCodes).where(eq(telegramLinkCodes.userId, user.id))

  await sendMessage(token, chatId, "✅ Аккаунт подключён. Теперь можно задавать вопросы базе знаний — просто напишите сообщение.")
}

async function handleAsk(token: string, tenantId: string, chatId: number, question: string) {
  if (!question.trim()) {
    await sendMessage(token, chatId, "Сформулируйте вопрос после команды: `/ask как оформить отпуск`")
    return
  }

  const [user] = await db
    .select({ id: users.id, companyId: users.companyId })
    .from(users)
    .where(eq(users.telegramChatId, String(chatId)))
    .limit(1)

  if (!user || user.companyId !== tenantId) {
    await sendMessage(token, chatId, "Для подключения бота отправьте `/start КОД` (код — в настройках платформы, раздел «База знаний → Telegram-бот»).")
    return
  }

  // Hard-stop: не тратим Claude, если лимит AI-токенов компании исчерпан.
  const limitCheck = await checkAiTokenLimit(tenantId)
  if (!limitCheck.allowed) {
    await sendMessage(token, chatId, limitCheck.message ?? "Лимит AI-токенов на этот месяц исчерпан.")
    return
  }

  const { context, materialsList } = await retrieveKnowledgeContext(tenantId, question)
  const result = await askClaude(question, context, materialsList)

  if (!result) {
    await sendMessage(
      token,
      chatId,
      "AI-ассистент временно недоступен. Попробуйте позже или обратитесь напрямую к администратору базы знаний.",
    )
    return
  }

  void logAiUsage({
    tenantId,
    userId: user.id,
    action: "knowledge_telegram_ask",
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    model: AI_MODEL_MAIN,
  })

  const sourceLine = result.cited.length > 0
    ? `\n\n📎 _Источник: ${result.cited.map((c) => c.name).join(", ")}_`
    : ""
  await sendMessage(token, chatId, `📚 *Ответ из базы знаний:*\n\n${result.answer}${sourceLine}`)
}

// Bot API отдаёт файл только до 20 МБ — голосовые Telegram (Opus) почти
// всегда меньше, но проверяем явно до попытки скачать.
const TELEGRAM_FILE_DOWNLOAD_LIMIT = 20 * 1024 * 1024

async function handleVoice(token: string, tenantId: string, chatId: number, voice: TelegramVoice) {
  if (!isTelegramSttConfigured()) {
    await sendMessage(
      token,
      chatId,
      "🎤 Голосовые сообщения пока не поддерживаются ботом. Напишите вопрос текстом.",
    )
    return
  }

  if (typeof voice.file_size === "number" && voice.file_size > TELEGRAM_FILE_DOWNLOAD_LIMIT) {
    await sendMessage(token, chatId, "Голосовое сообщение слишком длинное. Сформулируйте вопрос текстом.")
    return
  }

  const file = await tgGetFile(token, voice.file_id)
  if (!file) {
    await sendMessage(token, chatId, "Не удалось скачать голосовое сообщение. Попробуйте ещё раз или напишите текстом.")
    return
  }

  const buf = await tgDownloadFile(token, file.filePath)
  if (!buf) {
    await sendMessage(token, chatId, "Не удалось скачать голосовое сообщение. Попробуйте ещё раз или напишите текстом.")
    return
  }

  const transcribed = await transcribeVoice(buf)
  if (!transcribed.ok || !transcribed.text) {
    await sendMessage(
      token,
      chatId,
      "Не удалось распознать голосовое сообщение. Попробуйте ещё раз или напишите вопрос текстом.",
    )
    return
  }

  // Дальше — тот же пайплайн, что и текстовый вопрос.
  await handleAsk(token, tenantId, chatId, transcribed.text)
}

// ─── Route handler ─────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  const { tenantId } = await params

  // Секрет обязателен: если env не задан или заголовок не совпал — 403.
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (!expectedSecret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const header = req.headers.get("x-telegram-bot-api-secret-token")
  if (header !== expectedSecret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Load bot token for this tenant
  const [company] = await db
    .select({ id: companies.id, token: companies.telegramBotToken })
    .from(companies)
    .where(eq(companies.id, tenantId))
    .limit(1)

  if (!company?.token) {
    console.error("[telegram multitenant] no token for tenant", tenantId)
    return NextResponse.json({ ok: true })
  }
  const token = company.token

  let update: TelegramUpdate
  try {
    update = await req.json() as TelegramUpdate
  } catch {
    return NextResponse.json({ ok: true })
  }

  const message = update.message
  if (!message) {
    return NextResponse.json({ ok: true })
  }
  if (typeof message.text !== "string" && !message.voice) {
    // Ни текст, ни голос (фото/стикер/документ и т.п.) — молча игнорируем.
    return NextResponse.json({ ok: true })
  }

  const chatId = message.chat.id

  try {
    if (message.voice) {
      await handleVoice(token, tenantId, chatId, message.voice)
      return NextResponse.json({ ok: true })
    }

    const text = (message.text ?? "").trim()

    if (text.startsWith("/start")) {
      const code = text.slice("/start".length).trim()
      await handleStart(token, tenantId, chatId, code)
    } else if (text.startsWith("/ask")) {
      const question = text.slice("/ask".length).trim()
      await handleAsk(token, tenantId, chatId, question)
    } else if (text.startsWith("/help")) {
      await sendMessage(
        token,
        chatId,
        "*AI-ассистент базы знаний*\n\n" +
          "Команды:\n" +
          "`/start КОД` — привязать аккаунт (код возьмите в настройках платформы)\n" +
          "`/ask ВОПРОС` — спросить у базы знаний\n\n" +
          "Или просто напишите вопрос обычным сообщением (текстом или голосом).",
      )
    } else {
      await handleAsk(token, tenantId, chatId, text)
    }
  } catch (err) {
    console.error("[telegram multitenant webhook]", err)
    await sendMessage(token, chatId, "Произошла ошибка. Попробуйте ещё раз позже.")
  }

  return NextResponse.json({ ok: true })
}
