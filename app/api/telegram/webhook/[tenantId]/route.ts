import { NextRequest, NextResponse } from "next/server"
import { and, desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies, users, demoTemplates, knowledgeArticles } from "@/lib/db/schema"
import { getClaudeMessagesUrl } from "@/lib/claude-proxy"

// ─── Types ─────────────────────────────────────────────────────────────────

interface TelegramMessage {
  message_id: number
  chat: { id: number; type: string }
  from?: { id: number; first_name?: string; username?: string }
  text?: string
}

interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
}

interface MaterialRef {
  id: string
  name: string
  type: "demo" | "article"
}

interface ClaudeResponse {
  answer: string
  cited: MaterialRef[]
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

const MAX_PER_TYPE = 10
const EXCERPT_LEN = 300

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

function demoExcerpt(sections: unknown): string {
  if (!Array.isArray(sections) || sections.length === 0) return ""
  const first = sections[0] as { blocks?: { content?: string }[] }
  if (!Array.isArray(first?.blocks)) return ""
  return first.blocks
    .map((b) => stripHtml(b.content || ""))
    .filter(Boolean)
    .join(" ")
    .slice(0, EXCERPT_LEN)
}

async function loadContext(companyId: string): Promise<{ context: string; materialsList: MaterialRef[] }> {
  const [demos, articles] = await Promise.all([
    db
      .select({ id: demoTemplates.id, name: demoTemplates.name, sections: demoTemplates.sections })
      .from(demoTemplates)
      .where(eq(demoTemplates.tenantId, companyId))
      .orderBy(desc(demoTemplates.updatedAt))
      .limit(MAX_PER_TYPE),
    db
      .select({ id: knowledgeArticles.id, title: knowledgeArticles.title, content: knowledgeArticles.content })
      .from(knowledgeArticles)
      .where(and(
        eq(knowledgeArticles.tenantId, companyId),
        eq(knowledgeArticles.status, "published"),
      ))
      .orderBy(desc(knowledgeArticles.updatedAt))
      .limit(MAX_PER_TYPE),
  ])

  const parts: string[] = []
  const materialsList: MaterialRef[] = []
  let idx = 1
  for (const d of demos) {
    parts.push(`[${idx}] «${d.name}» (презентация)\n${demoExcerpt(d.sections) || "(нет содержания)"}`)
    materialsList.push({ id: d.id, name: d.name, type: "demo" })
    idx++
  }
  for (const a of articles) {
    parts.push(`[${idx}] «${a.title}» (статья)\n${stripHtml(a.content || "").slice(0, EXCERPT_LEN) || "(нет содержания)"}`)
    materialsList.push({ id: a.id, name: a.title, type: "article" })
    idx++
  }
  return {
    context: parts.join("\n\n") || "В базе знаний пока нет материалов.",
    materialsList,
  }
}

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
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
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
    const data = await res.json() as { content?: { type: string; text?: string }[] }
    const answer = data.content?.find((c) => c.type === "text")?.text?.trim() || ""
    if (!answer) return null
    const lowered = answer.toLowerCase()
    const cited = materialsList.filter((m) => m.name && lowered.includes(m.name.toLowerCase())).slice(0, 3)
    return { answer, cited }
  } catch (err) {
    console.error("[telegram multitenant] Claude fetch failed", err)
    return null
  }
}

// ─── Handlers ──────────────────────────────────────────────────────────────

async function handleStart(token: string, tenantId: string, chatId: number, email: string) {
  const trimmed = email.trim().toLowerCase()
  if (!trimmed) {
    await sendMessage(token, chatId, "Укажите email: `/start your@email.ru`")
    return
  }
  const [user] = await db
    .select({ id: users.id, companyId: users.companyId })
    .from(users)
    .where(eq(users.email, trimmed))
    .limit(1)

  if (!user || user.companyId !== tenantId) {
    await sendMessage(token, chatId, "Пользователь с таким email не найден в вашей компании.")
    return
  }
  await db
    .update(users)
    .set({ telegramChatId: String(chatId) })
    .where(eq(users.id, user.id))
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
    await sendMessage(token, chatId, "Для подключения бота отправьте команду `/start ВАШЕ_EMAIL`")
    return
  }

  const { context, materialsList } = await loadContext(tenantId)
  const result = await askClaude(question, context, materialsList)

  if (!result) {
    await sendMessage(
      token,
      chatId,
      "AI-ассистент временно недоступен. Попробуйте позже или обратитесь напрямую к администратору базы знаний.",
    )
    return
  }

  const sourceLine = result.cited.length > 0
    ? `\n\n📎 _Источник: ${result.cited.map((c) => c.name).join(", ")}_`
    : ""
  await sendMessage(token, chatId, `📚 *Ответ из базы знаний:*\n\n${result.answer}${sourceLine}`)
}

// ─── Route handler ─────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  const { tenantId } = await params

  // Optional secret verification
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (expectedSecret) {
    const header = req.headers.get("x-telegram-bot-api-secret-token")
    if (header !== expectedSecret) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
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
  if (!message || typeof message.text !== "string") {
    return NextResponse.json({ ok: true })
  }

  const chatId = message.chat.id
  const text = message.text.trim()

  try {
    if (text.startsWith("/start")) {
      const email = text.slice("/start".length).trim()
      await handleStart(token, tenantId, chatId, email)
    } else if (text.startsWith("/ask")) {
      const question = text.slice("/ask".length).trim()
      await handleAsk(token, tenantId, chatId, question)
    } else if (text.startsWith("/help")) {
      await sendMessage(
        token,
        chatId,
        "*AI-ассистент базы знаний*\n\n" +
          "Команды:\n" +
          "`/start EMAIL` — привязать аккаунт\n" +
          "`/ask ВОПРОС` — спросить у базы знаний\n\n" +
          "Или просто напишите вопрос обычным сообщением.",
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
