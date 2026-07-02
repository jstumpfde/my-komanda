// Серверный прокси к Claude /v1/messages для клиентских AI-фич
// (библиотека курсов, тренировки, AI-ассистент базы знаний).
//
// Заменяет GET /api/ai/key: ключ ANTHROPIC_API_KEY больше НЕ покидает сервер.
// Запросы идут через claude-proxy (getClaudeApiUrl) — с RU-сервера прямой
// доступ к api.anthropic.com заблокирован, браузерные вызовы были обходом,
// который раздавал ключ платформы любому залогиненному пользователю.

import { NextRequest, NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { requireCompany } from "@/lib/api-helpers"
import { getClaudeApiUrl } from "@/lib/claude-proxy"
import { AI_MODEL_MAIN, AI_MODEL_FAST } from "@/lib/ai/models"
import { checkRateLimit } from "@/lib/rate-limit"

export const runtime = "nodejs"
export const maxDuration = 300

const MAX_TOKENS_CAP = 16384
const MAX_MESSAGES = 60
const MAX_TOTAL_CHARS = 400_000

// Разрешённые модели — только актуальные id (снятые claude-3-* / claude-haiku-4-2025*
// возвращали 404 от API). Реестр и политика — lib/ai/models.ts.
const ALLOWED_MODELS = new Set([
  AI_MODEL_MAIN,       // claude-sonnet-5
  "claude-sonnet-4-6",
  AI_MODEL_FAST,       // claude-haiku-4-5-20251001
  "claude-opus-4-8",
])

interface InMessage {
  role: "user" | "assistant"
  content: string
}

export async function POST(req: NextRequest) {
  try {
    await requireCompany()
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "AI не настроен" }, { status: 500 })
  }

  const body = await req.json().catch(() => null) as {
    model?: string
    max_tokens?: number
    system?: string
    messages?: InMessage[]
  } | null

  const messages = body?.messages
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return NextResponse.json({ error: "Некорректные messages" }, { status: 400 })
  }
  let totalChars = 0
  for (const m of messages) {
    if ((m?.role !== "user" && m?.role !== "assistant") || typeof m?.content !== "string") {
      return NextResponse.json({ error: "Некорректные messages" }, { status: 400 })
    }
    totalChars += m.content.length
  }
  const system = body?.system
  if (system !== undefined && typeof system !== "string") {
    return NextResponse.json({ error: "Некорректный system" }, { status: 400 })
  }
  if (totalChars + (system?.length ?? 0) > MAX_TOTAL_CHARS) {
    return NextResponse.json({ error: "Слишком длинный запрос" }, { status: 400 })
  }
  // Rate-limit: 60 запросов в минуту на companyId
  let companyId: string | undefined
  try {
    const session = await import("@/auth").then(m => m.auth())
    companyId = (session?.user as { companyId?: string } | undefined)?.companyId ?? undefined
  } catch { /* игнорируем — requireCompany выше уже проверил */ }
  const rlKey = `ai-messages:${companyId ?? "unknown"}`
  if (!checkRateLimit(rlKey, 60, 60_000)) {
    return NextResponse.json({ error: "Слишком много запросов, подождите" }, { status: 429 })
  }

  // Только разрешённые модели (opus не допускается для клиентских фич)
  const requestedModel = typeof body?.model === "string" ? body.model : ""
  const model = ALLOWED_MODELS.has(requestedModel)
    ? requestedModel
    : AI_MODEL_MAIN
  const maxTokens = Math.min(Math.max(Number(body?.max_tokens) || 1536, 1), MAX_TOKENS_CAP) // дефолт 1536: запас под токенизатор Sonnet 5

  try {
    const client = new Anthropic({ baseURL: getClaudeApiUrl() })
    const resp = await client.messages.create({
      model,
      max_tokens: maxTokens,
      // Sonnet 5: без поля thinking включился бы adaptive (thinking-токены едят
      // max_tokens). Выключаем явно; {type:"disabled"} валиден на всех ALLOWED_MODELS.
      thinking: { type: "disabled" },
      ...(system ? { system } : {}),
      messages,
    })
    return NextResponse.json({ content: resp.content, usage: resp.usage })
  } catch (err) {
    console.error("[ai/messages] Claude error:", err instanceof Error ? err.message : err)
    return NextResponse.json({ error: "Claude API вернул ошибку" }, { status: 502 })
  }
}
