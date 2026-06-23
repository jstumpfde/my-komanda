// Серверный ответ AI для публичного чата базы знаний (/ask/[code]).
// Заменяет браузерный вызов Anthropic с ключом из context-эндпоинта
// (ключ платформы утекал любому, кто знает код и пароль чата).

import { NextRequest, NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { verifyToken } from "../auth/route"
import { getClaudeApiUrl } from "@/lib/claude-proxy"
import { checkRateLimit } from "@/lib/rate-limit"
import { buildPublicChatContext } from "@/lib/knowledge/public-chat-context"

const SYSTEM_PROMPT =
  "Ты — Ненси, AI-ассистент корпоративной базы знаний компании. " +
  "Отвечай на вопросы ТОЛЬКО на основе предоставленных материалов. " +
  "Если ответ есть — дай краткий ответ и укажи название материала в скобках. " +
  "Если не найден — скажи что не нашёл. Отвечай на русском, кратко, 2-4 предложения."

const CLAUDE_MODEL = "claude-sonnet-4-6"
const MAX_QUESTION_LEN = 2000

export async function POST(req: NextRequest) {
  let body: { token?: string; question?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Невалидный JSON" }, { status: 400 })
  }

  if (!body.token) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 })
  }
  const payload = verifyToken(body.token)
  if (!payload || !payload.companyId) {
    return NextResponse.json({ error: "Сессия истекла" }, { status: 401 })
  }

  const question = (body.question ?? "").trim()
  if (!question || question.length > MAX_QUESTION_LEN) {
    return NextResponse.json({ error: "Некорректный вопрос" }, { status: 400 })
  }

  // Анонимный эндпоинт, жгущий токены Claude — лимитируем по компании
  if (!checkRateLimit(`public-ask:${payload.companyId}`, 30, 60_000)) {
    return NextResponse.json({ error: "Слишком много запросов, попробуйте через минуту" }, { status: 429 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "AI временно недоступен" }, { status: 500 })
  }

  const { context, materialsList } = await buildPublicChatContext(payload.companyId)

  try {
    const client = new Anthropic({ baseURL: getClaudeApiUrl() })
    const resp = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: `Материалы компании:\n${context}\n\nВопрос: ${question}` },
      ],
    })
    const answer = resp.content.find((c) => c.type === "text")?.text?.trim() ?? ""
    if (!answer) {
      return NextResponse.json({ error: "Пустой ответ" }, { status: 502 })
    }
    return NextResponse.json({ answer, materialsList })
  } catch (err) {
    console.error("[public-ask/answer] Claude error:", err instanceof Error ? err.message : err)
    return NextResponse.json({ error: "AI API вернул ошибку" }, { status: 502 })
  }
}
