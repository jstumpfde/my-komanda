import { NextRequest, NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { getClaudeMessagesUrl } from "@/lib/claude-proxy"
import {
  buildPrompt,
  tryParseJsonArray,
  CLAUDE_MODEL,
  type PromptParams,
  type ClaudeResult,
} from "@/lib/knowledge-v2/demo-ai"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    await requireCompany()
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY не настроен" }, { status: 503 })
  }

  let body: { text?: string; params?: PromptParams }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Невалидный JSON" }, { status: 400 })
  }

  const text = body.text?.trim()
  if (!text) {
    return NextResponse.json({ error: "Текст обязателен" }, { status: 400 })
  }
  if (!body.params) {
    return NextResponse.json({ error: "params обязательны" }, { status: 400 })
  }

  const prompt = buildPrompt(text, body.params)

  let aiRes: Response
  try {
    aiRes = await fetch(getClaudeMessagesUrl(), {
      method: "POST",
      signal: req.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 16384,
        messages: [{ role: "user", content: prompt }],
      }),
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return NextResponse.json({ error: "Запрос отменён" }, { status: 499 })
    }
    console.error("[parse-with-ai] network error", err)
    return NextResponse.json({ error: "Ошибка соединения с Claude API" }, { status: 502 })
  }

  if (!aiRes.ok) {
    const errText = await aiRes.text().catch(() => "")
    console.error("[parse-with-ai] Claude HTTP", aiRes.status, errText.slice(0, 500))
    return NextResponse.json({ error: `Claude API вернул ${aiRes.status}` }, { status: 502 })
  }

  const data = await aiRes.json() as {
    content?: { type: string; text?: string }[]
    usage?: { input_tokens?: number; output_tokens?: number }
  }
  const textContent = data.content?.find((c) => c.type === "text")?.text ?? ""
  if (!textContent) {
    return NextResponse.json({ error: "Пустой ответ от Claude API" }, { status: 502 })
  }

  const lessons = tryParseJsonArray(textContent)
  if (!lessons || lessons.length === 0) {
    console.error("[parse-with-ai] unparseable", textContent.slice(0, 500))
    return NextResponse.json({ error: "Не удалось распарсить ответ Claude" }, { status: 422 })
  }

  const result: ClaudeResult = {
    lessons,
    usage: {
      input_tokens: data.usage?.input_tokens ?? 0,
      output_tokens: data.usage?.output_tokens ?? 0,
    },
  }
  return NextResponse.json(result)
}
