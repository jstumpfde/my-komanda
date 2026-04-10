import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { aiChatMessages } from "@/lib/db/schema"
import { eq, and, desc } from "drizzle-orm"
import { getClaudeMessagesUrl } from "@/lib/claude-proxy"

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const MODEL = "claude-sonnet-4-20250514"

const SYSTEM_PROMPT = `Ты — AI-ассистент HR-платформы my-komanda. Ты помогаешь HR-менеджерам и руководителям.

Ты можешь:
- Отвечать на вопросы о HR-процессах (найм, адаптация, обучение, оценка)
- Помогать с формулировками вакансий
- Давать рекомендации по удержанию сотрудников
- Анализировать метрики HR (flight risk, пульс-опросы, eNPS)
- Помогать с планами адаптации и обучения
- Консультировать по трудовому законодательству РФ

Отвечай на русском языке. Будь кратким и практичным.`

// GET /api/modules/hr/ai-chat — история сообщений
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(req.url)
  const sessionId = url.searchParams.get("sessionId")

  const messages = await db.select().from(aiChatMessages)
    .where(and(
      eq(aiChatMessages.tenantId, session.user.companyId),
      eq(aiChatMessages.userId, session.user.id),
      sessionId ? eq(aiChatMessages.sessionId, sessionId) : undefined,
    ))
    .orderBy(aiChatMessages.createdAt)
    .limit(50)

  return NextResponse.json(messages)
}

// POST /api/modules/hr/ai-chat — send message
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 })
  }

  const body = await req.json()
  const { message, sessionId } = body

  if (!message) return NextResponse.json({ error: "message required" }, { status: 400 })

  const chatSessionId = sessionId || `session-${Date.now()}`

  // Save user message
  await db.insert(aiChatMessages).values({
    tenantId:  session.user.companyId,
    userId:    session.user.id,
    role:      "user",
    content:   message,
    sessionId: chatSessionId,
  })

  // Get recent history for context
  const history = await db.select().from(aiChatMessages)
    .where(and(
      eq(aiChatMessages.tenantId, session.user.companyId),
      eq(aiChatMessages.userId, session.user.id),
      eq(aiChatMessages.sessionId, chatSessionId),
    ))
    .orderBy(aiChatMessages.createdAt)
    .limit(20)

  const messages = history.map(m => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }))

  try {
    const response = await fetch(getClaudeMessagesUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages,
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      return NextResponse.json({ error: "AI API error", details: err }, { status: 502 })
    }

    const data = await response.json()
    const assistantText = data.content
      ?.filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("\n") || "Не удалось получить ответ."

    // Save assistant response
    await db.insert(aiChatMessages).values({
      tenantId:  session.user.companyId,
      userId:    session.user.id,
      role:      "assistant",
      content:   assistantText,
      sessionId: chatSessionId,
      metadata:  { model: MODEL, tokensUsed: data.usage },
    })

    return NextResponse.json({
      reply: assistantText,
      sessionId: chatSessionId,
    })
  } catch (err) {
    return NextResponse.json({ error: "Failed to call AI API" }, { status: 502 })
  }
}
