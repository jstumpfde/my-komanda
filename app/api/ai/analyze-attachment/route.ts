import { NextRequest } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { requireAuth, apiError, apiSuccess } from "@/lib/api-helpers"

const client = new Anthropic()

const SYSTEM_PROMPT = `Ты — HR-аналитик. Тебе дают текст из загруженного документа и название вакансии. Определи:

1. Тип документа (ровно одно значение):
   - "описание_должности" — должностная инструкция, описание позиции
   - "регламент" — рабочий процесс, SOP, стандарт
   - "инструкция" — руководство, мануал, обучающий материал
   - "вакансия" — текст вакансии с job-борда или внутренний
   - "резюме" — CV кандидата
   - "другое" — полезный документ, не попадающий в категории выше
   - "мусор" — нерелевантный документ (счёт, реклама, спам)

2. Релевантность к указанной вакансии:
   - "high" — напрямую описывает эту должность или обязанности
   - "medium" — частично связан (общие регламенты компании, смежная должность)
   - "low" — не связан с вакансией

3. Краткое описание документа (1 предложение, до 100 символов). Пример: "Должностная инструкция менеджера по продажам, 2 стр."

4. Извлечённые данные (ТОЛЬКО если документ содержит информацию об обязанностях, требованиях или условиях работы):
   - responsibilities: строка с обязанностями (формат: "• пункт\\n• пункт"), или пустая строка
   - requirements: строка с требованиями, или пустая строка
   - conditions: массив коротких тегов условий (["ДМС", "Гибкий график"]), или пустой массив

ПРАВИЛА:
- Верни ТОЛЬКО валидный JSON. Без markdown, без комментариев.
- Не придумывай данных. Если в тексте нет обязанностей — верни пустую строку.
- Извлекай только конкретные факты из текста.

ФОРМАТ:
{
  "type": "описание_должности",
  "relevance": "high",
  "summary": "Краткое описание документа",
  "extractedData": {
    "responsibilities": "",
    "requirements": "",
    "conditions": []
  }
}`

interface AnalyzeInput {
  text: string
  vacancyTitle?: string
}

export interface AnalyzeResult {
  type: string
  relevance: "high" | "medium" | "low"
  summary: string
  extractedData: {
    responsibilities: string
    requirements: string
    conditions: string[]
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth()

    const body = (await req.json()) as AnalyzeInput
    if (!body.text?.trim()) return apiError("Текст обязателен", 400)

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return apiSuccess(fallbackAnalyze(body.text))
    }

    const userMessage = body.vacancyTitle
      ? `Вакансия: ${body.vacancyTitle}\n\n--- Текст документа ---\n${body.text.slice(0, 3000)}`
      : body.text.slice(0, 3000)

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    })

    const content = response.content[0]
    if (content.type !== "text") return apiError("Неожиданный ответ AI", 500)

    let parsed: Record<string, unknown>
    try {
      const raw = content.text.replace(/^```json?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim()
      parsed = JSON.parse(raw)
    } catch {
      const jsonMatch = content.text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0])
      } else {
        return apiError("Не удалось разобрать ответ AI", 422)
      }
    }

    const result: AnalyzeResult = {
      type: String(parsed.type || "другое"),
      relevance: (["high", "medium", "low"].includes(String(parsed.relevance)) ? String(parsed.relevance) : "medium") as AnalyzeResult["relevance"],
      summary: String(parsed.summary || ""),
      extractedData: {
        responsibilities: String((parsed.extractedData as Record<string, unknown>)?.responsibilities || ""),
        requirements: String((parsed.extractedData as Record<string, unknown>)?.requirements || ""),
        conditions: Array.isArray((parsed.extractedData as Record<string, unknown>)?.conditions)
          ? ((parsed.extractedData as Record<string, unknown>).conditions as unknown[]).map(String)
          : [],
      },
    }

    return apiSuccess(result)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("analyze-attachment error:", err)
    return apiError("Internal server error", 500)
  }
}

function fallbackAnalyze(text: string): AnalyzeResult {
  const lower = text.toLowerCase()
  const hasResponsibilities = lower.includes("обязанности") || lower.includes("задачи")
  const hasRequirements = lower.includes("требования") || lower.includes("опыт")

  let type = "другое"
  if (lower.includes("должностная инструкция") || lower.includes("описание должности")) type = "описание_должности"
  else if (lower.includes("вакансия") || lower.includes("мы ищем")) type = "вакансия"
  else if (lower.includes("резюме") || lower.includes("curriculum")) type = "резюме"
  else if (lower.includes("регламент") || lower.includes("процедура")) type = "регламент"

  return {
    type,
    relevance: hasResponsibilities || hasRequirements ? "high" : "medium",
    summary: text.split(/[.\n]/)[0]?.trim().slice(0, 100) || "Документ",
    extractedData: { responsibilities: "", requirements: "", conditions: [] },
  }
}
