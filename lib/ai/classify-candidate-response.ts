import Anthropic from "@anthropic-ai/sdk"
import { getClaudeApiUrl } from "@/lib/claude-proxy"

export type CandidateIntent =
  | "rejection"
  | "wants_personal_contact"
  | "busy_later"
  | "agreement"
  | "unclear"

export type SuggestedAction =
  | "move_to_rejected"
  | "move_to_wants_contact"
  | "no_action"
  | "move_to_next_stage"

export interface ClassificationResult {
  intent: CandidateIntent
  confidence: number
  suggestedAction: SuggestedAction
  reasoning?: string
  farewellMessage?: string
}

const FAREWELL = "Спасибо за отклик. Желаем удачи!"

function buildPrompt(message: string, vacancyTitle?: string): string {
  return `Ты классификатор ответов кандидатов в чате с HR на вакансию "${vacancyTitle || "не указана"}".
Ответ кандидата: "${message}"

Категории:
- rejection: явный отказ ("нет", "не интересно", "уже нашёл работу", "спасибо, нет")
- wants_personal_contact: хочет общаться лично, не через автоматизацию ("давайте созвонимся", "хочу пообщаться лично", "пришлите номер")
- busy_later: занят, ответит позже ("сейчас не могу", "напишу позже")
- agreement: согласен, готов идти дальше ("да, интересно", "хорошо", "готов пройти демо")
- unclear: не определено

Верни ТОЛЬКО валидный JSON без префиксов и пояснений:
{ "intent": "rejection", "confidence": 0.95, "reasoning": "..." }`
}

function intentToAction(intent: CandidateIntent): SuggestedAction {
  switch (intent) {
    case "rejection":
      return "move_to_rejected"
    case "wants_personal_contact":
      return "move_to_wants_contact"
    case "agreement":
      // НЕ автоматизируем переход в agreement — слишком рискованно (инструкция Юрия).
      return "no_action"
    default:
      return "no_action"
  }
}

const client = new Anthropic({ baseURL: getClaudeApiUrl() })

export async function classifyCandidateResponse(
  message: string,
  context?: { candidateName?: string; vacancyTitle?: string }
): Promise<ClassificationResult> {
  const trimmed = (message || "").trim()
  if (!trimmed) {
    return {
      intent: "unclear",
      confidence: 0,
      suggestedAction: "no_action",
      reasoning: "Пустое сообщение",
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    // Без ключа возвращаем unclear — никаких автоматических действий.
    return {
      intent: "unclear",
      confidence: 0,
      suggestedAction: "no_action",
      reasoning: "ANTHROPIC_API_KEY не задан",
    }
  }

  let parsed: { intent?: string; confidence?: number; reasoning?: string }
  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [{ role: "user", content: buildPrompt(trimmed, context?.vacancyTitle) }],
    })
    const content = response.content[0]
    if (!content || content.type !== "text") {
      throw new Error("Неожиданный ответ AI")
    }
    const raw = content.text.replace(/^```json?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim()
    try {
      parsed = JSON.parse(raw)
    } catch {
      const match = raw.match(/\{[\s\S]*\}/)
      if (!match) throw new Error("AI не вернул JSON")
      parsed = JSON.parse(match[0])
    }
  } catch (err) {
    console.error("[classifyCandidateResponse] AI failed:", err instanceof Error ? err.message : err)
    return {
      intent: "unclear",
      confidence: 0,
      suggestedAction: "no_action",
      reasoning: "AI вернул ошибку",
    }
  }

  const allowed: CandidateIntent[] = [
    "rejection",
    "wants_personal_contact",
    "busy_later",
    "agreement",
    "unclear",
  ]
  const intent: CandidateIntent = allowed.includes(parsed.intent as CandidateIntent)
    ? (parsed.intent as CandidateIntent)
    : "unclear"
  const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0))

  const result: ClassificationResult = {
    intent,
    confidence,
    suggestedAction: intentToAction(intent),
    reasoning: parsed.reasoning ? String(parsed.reasoning) : undefined,
  }
  if (intent === "rejection") {
    result.farewellMessage = FAREWELL
  }
  return result
}
