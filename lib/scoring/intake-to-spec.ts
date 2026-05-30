// Конвертер: заявка клиента (vacancyIntakes.data) → ScoringSpec.
// Замыкает конвейер: публичный интейк → машинная спецификация отбора →
// рубричный движок (lib/scoring/rubric.ts). Клиент формулирует «кто подходит /
// кто нет / что критично», AI превращает это в критерии + веса + стоп-факторы.

import type Anthropic from "@anthropic-ai/sdk"
import { AI_SAFETY_PROMPT } from "@/lib/ai-safety"
import { getScoringClient } from "./anthropic-client"
import type { ScoringSpec, WeightLevel } from "./types"

// Поля, которые собирает публичная интейк-форма (app/(public)/intake/[token]).
export interface IntakeData {
  title?: string
  description?: string
  requirements?: string
  city?: string
  workFormat?: string
  salaryFrom?: string | number
  salaryTo?: string | number
  externalUrl?: string
  // Блок критериев отбора:
  mustHave?: string
  dealBreakers?: string
  goodExample?: string
  badExample?: string
  topPriority?: string
}

const MODEL = "claude-sonnet-4-20250514"

const TOOL: Anthropic.Tool = {
  name: "submit_spec",
  description: "Вернуть структурированную спецификацию отбора кандидатов.",
  input_schema: {
    type: "object",
    properties: {
      positionSummary: { type: "string", description: "Сжатое описание должности и задач (2-4 предложения)." },
      requiredSkills:  { type: "array", items: { type: "string" }, description: "Обязательные навыки/компетенции." },
      niceSkills:      { type: "array", items: { type: "string" }, description: "Желательные навыки." },
      idealProfile:    { type: "string", description: "Портрет идеального кандидата (с учётом примеров клиента)." },
      minExperienceYears: { type: "integer", minimum: 0, description: "Минимальный опыт в годах (0 если не важно)." },
      knockouts:       { type: "array", items: { type: "string" }, description: "Жёсткие стоп-факторы → автоматический отказ." },
      criteria: {
        type: "array",
        description: "Критерии оценки соответствия (4-8 шт.).",
        items: {
          type: "object",
          properties: {
            key:    { type: "string", description: "короткий латинский ключ (snake_case)" },
            label:  { type: "string", description: "название критерия по-русски" },
            weight: { type: "string", enum: ["critical", "important", "nice", "irrelevant"] },
            hint:   { type: "string", description: "что именно проверять в резюме" },
          },
          required: ["key", "label", "weight"],
        },
      },
    },
    required: ["positionSummary", "criteria"],
  } as Anthropic.Tool.InputSchema,
}

const SYSTEM = `Ты — HR-методолог. Тебе дают заявку заказчика на подбор сотрудника (что за должность, требования, и — главное — что для клиента критично, кто точно подходит, кто точно нет). Преврати это в СПЕЦИФИКАЦИЮ ОТБОРА для автоматической оценки резюме.

Правила:
- Выдели 4-8 критериев оценки. Вес критерия определяй по тому, насколько клиент его выделил: то, что названо «обязательно/самое важное» → critical; важное → important; «плюсом» → nice; второстепенное → irrelevant.
- knockouts = жёсткие стоп-факторы из «что недопустимо» и «кто точно НЕ подойдёт». Только то, что действительно дисквалифицирует.
- idealProfile собери с учётом «примера идеального кандидата».
- Не выдумывай требований, которых нет в заявке. Если данных мало — делай меньше критериев, но корректных.
- Верни результат ТОЛЬКО через инструмент submit_spec.

${AI_SAFETY_PROMPT}`

function num(v: string | number | undefined): number | undefined {
  if (v === undefined || v === "") return undefined
  const n = typeof v === "number" ? v : parseInt(String(v).replace(/\D/g, ""))
  return Number.isFinite(n) ? n : undefined
}

function buildIntakeText(d: IntakeData): string {
  const L: string[] = []
  if (d.title)        L.push(`Должность: ${d.title}`)
  if (d.description)  L.push(`Кого ищут / задачи: ${d.description}`)
  if (d.requirements) L.push(`Требования: ${d.requirements}`)
  if (d.city)         L.push(`Город: ${d.city}`)
  if (d.workFormat)   L.push(`Формат: ${d.workFormat}`)
  if (d.salaryFrom || d.salaryTo) L.push(`Зарплата: ${d.salaryFrom ?? "?"}–${d.salaryTo ?? "?"}`)
  if (d.mustHave)     L.push(`\nОБЯЗАТЕЛЬНО (без чего точно нет): ${d.mustHave}`)
  if (d.dealBreakers) L.push(`НЕДОПУСТИМО (стоп-факторы): ${d.dealBreakers}`)
  if (d.goodExample)  L.push(`ПРИМЕР ИДЕАЛЬНОГО: ${d.goodExample}`)
  if (d.badExample)   L.push(`КТО ТОЧНО НЕ ПОДОЙДЁТ: ${d.badExample}`)
  if (d.topPriority)  L.push(`САМОЕ ВАЖНОЕ ПРИ ВЫБОРЕ: ${d.topPriority}`)
  return L.join("\n")
}

export async function intakeToScoringSpec(data: IntakeData): Promise<ScoringSpec> {
  const client = getScoringClient()
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    tools: [TOOL],
    tool_choice: { type: "tool", name: "submit_spec" },
    system: SYSTEM,
    messages: [{ role: "user", content: `ЗАЯВКА ЗАКАЗЧИКА:\n\n${buildIntakeText(data)}` }],
  })

  const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
  if (!toolUse) throw new Error("AI не вернул спецификацию")

  const out = toolUse.input as {
    positionSummary: string
    requiredSkills?: string[]
    niceSkills?: string[]
    idealProfile?: string
    minExperienceYears?: number
    knockouts?: string[]
    criteria: Array<{ key: string; label: string; weight: WeightLevel; hint?: string }>
  }

  return {
    vacancyTitle: data.title?.trim() || "Вакансия",
    positionSummary: out.positionSummary,
    requiredSkills: out.requiredSkills ?? [],
    niceSkills: out.niceSkills ?? [],
    idealProfile: out.idealProfile,
    minExperienceYears: out.minExperienceYears,
    salaryFrom: num(data.salaryFrom),
    salaryTo: num(data.salaryTo),
    location: data.city?.trim() || undefined,
    workFormat: data.workFormat?.trim() || undefined,
    knockouts: out.knockouts ?? [],
    criteria: out.criteria.map(c => ({
      key: c.key,
      label: c.label,
      weight: c.weight,
      hint: c.hint,
    })),
  }
}
