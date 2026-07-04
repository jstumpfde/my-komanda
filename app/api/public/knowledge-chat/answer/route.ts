// Серверный ответ AI для публичного чата базы знаний (/ask/[code]).
// Заменяет браузерный вызов Anthropic с ключом из context-эндпоинта
// (ключ платформы утекал любому, кто знает код и пароль чата).

import { NextRequest, NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { verifyToken } from "../auth/route"
import { getClaudeApiUrl } from "@/lib/claude-proxy"
import { checkRateLimit } from "@/lib/rate-limit"
import { retrieveKnowledgeContext } from "@/lib/knowledge/retrieval"
import { checkAiTokenLimit, logAiUsage } from "@/lib/knowledge/token-limits"
import { AI_MODEL_MAIN } from "@/lib/ai/models"

const SYSTEM_PROMPT =
  "Ты — Ненси, AI-ассистент корпоративной базы знаний компании. " +
  "Отвечай на вопросы ТОЛЬКО на основе предоставленных материалов. " +
  "Если ответ есть — дай краткий ответ и укажи название материала в скобках. " +
  "Если не найден — скажи что не нашёл. Отвечай на русском, кратко, 2-4 предложения."

const CLAUDE_MODEL = AI_MODEL_MAIN
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

  // Hard-stop: анонимный эндпоинт жжёт токены компании — не пускаем сверх лимита.
  const limitCheck = await checkAiTokenLimit(payload.companyId)
  if (!limitCheck.allowed) {
    return NextResponse.json({ error: limitCheck.message }, { status: 429 })
  }

  // Ранжирование по релевантности вопросу — общее с ai-search и Telegram-ботом
  // (lib/knowledge/retrieval.ts). Раньше здесь был сырой дамп последних материалов.
  const { context, materialsList } = await retrieveKnowledgeContext(payload.companyId, question)

  try {
    const client = new Anthropic({ baseURL: getClaudeApiUrl() })
    const resp = await client.messages.create({
      model: CLAUDE_MODEL,
      thinking: { type: "disabled" },
      max_tokens: 1536, // запас под токенизатор Sonnet 5 (~+30%)
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: `Материалы компании:\n${context}\n\nВопрос: ${question}` },
      ],
    })
    const answer = resp.content.find((c) => c.type === "text")?.text?.trim() ?? ""
    if (!answer) {
      return NextResponse.json({ error: "Пустой ответ" }, { status: 502 })
    }

    void logAiUsage({
      tenantId: payload.companyId,
      action: "knowledge_public_chat",
      inputTokens: resp.usage?.input_tokens ?? 0,
      outputTokens: resp.usage?.output_tokens ?? 0,
      model: CLAUDE_MODEL,
    })

    return NextResponse.json({ answer, materialsList })
  } catch (err) {
    console.error("[public-ask/answer] Claude error:", err instanceof Error ? err.message : err)
    return NextResponse.json({ error: "AI API вернул ошибку" }, { status: 502 })
  }
}
