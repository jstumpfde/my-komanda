import Anthropic from "@anthropic-ai/sdk"
import { getClaudeApiUrl } from "@/lib/claude-proxy"
import { AI_MODEL_FAST } from "@/lib/ai/models"

export type CandidateIntent =
  | "rejection"
  | "decline_requirement"
  | "wants_personal_contact"
  | "busy_later"
  | "agreement"
  | "unclear"

export type SuggestedAction =
  | "move_to_rejected"
  | "move_to_wants_contact"
  | "no_action"
  | "move_to_next_stage"
  // Инцидент 06.07 (кандидат Ильин, вакансия 6916): кандидат явно отказался
  // от ключевого требования вакансии («по холодным звонкам больше не
  // работаю») — это НЕ общий отказ от вакансии и НЕ повод для авто-отказа
  // (авто-отказ — осознанно только по стоп-факторам, см. CLAUDE.md). Но
  // дожимы, которые хвалят несоответствие («ваш опыт нам подходит»),
  // выглядят как будто система не читает ответы кандидата. Поэтому —
  // только пауза дожима + эскалация HR на ручной разбор.
  | "pause_and_escalate"

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
- rejection: явный отказ или потеря интереса К ВАКАНСИИ В ЦЕЛОМ ("нет", "не интересно", "не актуально", "уже не актуально", "уже не ищу", "не в поиске", "передумал", "уже нашёл работу", "нашёл другое предложение", "спасибо, нет", "отказываюсь", "не рассматриваю")
- decline_requirement: НЕ общий отказ от вакансии, а явный отказ от КОНКРЕТНОГО требования/условия должности — кандидат называет, что именно ему не подходит, но не говорит явного "нет" вакансии целиком ("по холодным звонкам больше не буду работать", "разъездной характер не подходит", "на такой график не соглашусь", "с такой оплатой не готов", "это не моё", если явно указано на конкретную обязанность/условие)
- wants_personal_contact: хочет общаться лично, не через автоматизацию ("давайте созвонимся", "хочу пообщаться лично", "пришлите номер")
- busy_later: занят, ответит позже ("сейчас не могу", "напишу позже")
- agreement: согласен, готов идти дальше ("да, интересно", "хорошо", "готов пройти демо")
- unclear: не определено

Если сообщение можно отнести и к rejection, и к decline_requirement — предпочти decline_requirement, если кандидат называет конкретную причину/требование, и rejection, только если это общее "нет" без причины.

Верни ТОЛЬКО валидный JSON без префиксов и пояснений:
{ "intent": "rejection", "confidence": 0.95, "reasoning": "..." }`
}

function intentToAction(intent: CandidateIntent): SuggestedAction {
  switch (intent) {
    case "rejection":
      return "move_to_rejected"
    case "decline_requirement":
      // НИКАКОГО авто-отказа — только пауза дожима + эскалация HR (см. тип выше).
      return "pause_and_escalate"
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
      model: AI_MODEL_FAST,
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
    "decline_requirement",
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
