// Сессия 9 (6b): AI-вердикт по ответам кандидата на вопросы предквалификации.
//
// Один Haiku-вызов оценивает ВСЕ вопросы за раз — экономия токенов и времени.
// На вход: массив { question, criterion }, общий текст ответа кандидата.
// На выход: массив { verdict, reasoning } той же длины.
//
// Модель та же что в screenResume — claude-haiku-4-5-20251001 через Cloudflare-прокси.

import Anthropic from "@anthropic-ai/sdk"
import { AI_SAFETY_PROMPT } from "@/lib/ai-safety"
import { getClaudeApiUrl } from "@/lib/claude-proxy"
import { addVacancyTokens } from "@/lib/ai/token-usage"
import { AI_MODEL_FAST } from "@/lib/ai/models"

export type QualificationVerdict = "passed" | "failed" | "unclear"

export interface QualificationQuestion {
  question:  string
  criterion: string   // что AI считает «правильным» ответом (опц.)
}

export interface QualificationResult {
  verdict:   QualificationVerdict
  reasoning: string
}

const client = new Anthropic({ baseURL: getClaudeApiUrl() })

const SYSTEM_PROMPT = `Ты — HR-аналитик. Оцени ответ кандидата на серию вопросов предквалификации.

Кандидат прислал ОДНО общее сообщение, в нём могут быть ответы на все, часть, или ни на один вопрос. Сопоставь сам, какой кусок ответа относится к какому вопросу.

Верни ТОЛЬКО валидный JSON-массив без markdown-обёртки. Длина массива РАВНА числу вопросов; результаты идут в том же порядке. Каждый элемент:
{ "verdict": "passed" | "failed" | "unclear", "reasoning": "<1-2 коротких предложения по-русски>" }

Правила:
- "passed" — ответ явно соответствует критерию.
- "failed" — ответ явно НЕ соответствует.
- "unclear" — ответа на этот вопрос в сообщении нет / он невнятный / двусмысленный.
- Не выдумывай факты которых нет в ответе.
- Если у вопроса критерий пустой — оценивай по здравому смыслу (например, осмысленный ответ ≠ "привет").
` + AI_SAFETY_PROMPT

export async function screenPrequalificationAnswers(
  questions: QualificationQuestion[],
  candidateAnswer: string,
  vacancyId?: string | null,
): Promise<QualificationResult[] | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null
  if (questions.length === 0) return []
  if (!candidateAnswer.trim()) {
    return questions.map(() => ({ verdict: "unclear" as const, reasoning: "Пустое сообщение кандидата" }))
  }

  const userMessage = `ВОПРОСЫ (${questions.length}):
${questions.map((q, i) => `${i + 1}. Вопрос: ${q.question}\n   Критерий правильного ответа: ${q.criterion?.trim() || "—"}`).join("\n\n")}

ОТВЕТ КАНДИДАТА (одно сообщение):
${candidateAnswer.trim()}`

  let raw = ""
  try {
    const response = await client.messages.create({
      model:       AI_MODEL_FAST,
      max_tokens:  600,
      temperature: 0,
      system:      SYSTEM_PROMPT,
      messages:    [{ role: "user", content: userMessage }],
    })
    const content = response.content[0]
    if (content.type !== "text") return null
    void addVacancyTokens(vacancyId, response.usage)
    raw = content.text.trim()
  } catch (err) {
    console.warn("[screen-prequalification] API call failed:", err instanceof Error ? err.message : err)
    return null
  }

  // Снимаем markdown-обёртку и парсим массив.
  const stripped = raw.replace(/^```json?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(stripped)
  } catch {
    const m = stripped.match(/\[[\s\S]*\]/)
    if (!m) return null
    try { parsed = JSON.parse(m[0]) } catch { return null }
  }
  if (!Array.isArray(parsed)) return null

  const out: QualificationResult[] = []
  for (let i = 0; i < questions.length; i++) {
    const item = parsed[i] as { verdict?: unknown; reasoning?: unknown } | undefined
    const rawV = String(item?.verdict ?? "").toLowerCase()
    const verdict: QualificationVerdict =
      rawV === "passed" ? "passed" :
      rawV === "failed" ? "failed" :
      "unclear"
    const reasoning = typeof item?.reasoning === "string"
      ? item.reasoning.trim().slice(0, 280)
      : ""
    out.push({ verdict, reasoning })
  }
  return out
}
