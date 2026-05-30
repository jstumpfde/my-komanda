// Рубричный движок соответствия «резюме ↔ вакансия» (прототип).
//
// Идея (в отличие от текущего «спроси Haiku — дай число 0-100»):
//   1. Спецификация отбора (ScoringSpec) = критерии + веса + жёсткие стоп-факторы.
//      Это машинная форма того, что HR/клиент задаёт в анкете вакансии.
//   2. LLM оценивает КАЖДЫЙ критерий 0-100 + доказательство (цитата из резюме)
//      + уверенность. Через forced tool-use → строго структурированный ответ.
//   3. Итоговый балл считается КОДОМ как взвешенная сумма — поэтому веса
//      реально влияют, а результат объясним и воспроизводим.
//   4. Спецификация вакансии уходит в system-блок с cache_control — при скоринге
//      многих кандидатов одной вакансии платим за неё один раз (prompt caching).
//
// Прод-путь позже должен ходить через CLAUDE_PROXY_URL; здесь — прямой SDK,
// чтобы прототип работал локально.

import Anthropic from "@anthropic-ai/sdk"
import { AI_SAFETY_PROMPT } from "@/lib/ai-safety"
import { getScoringClient } from "./anthropic-client"
import {
  WEIGHT_VALUES, WEIGHT_LABELS,
  type WeightLevel, type ScoringSpec, type Confidence, type Verdict,
  type CriterionResult, type RubricResult,
} from "./types"

// Реэкспорт типов/констант для серверных потребителей (клиенты импортируют из ./types).
export * from "./types"

const MODEL = "claude-sonnet-4-20250514"

// Инструмент, через который модель ОБЯЗАНА вернуть структурированную оценку.
function buildTool(spec: ScoringSpec): Anthropic.Tool {
  return {
    name: "submit_assessment",
    description: "Вернуть оценку соответствия кандидата по каждому критерию.",
    input_schema: {
      type: "object",
      properties: {
        criteria: {
          type: "array",
          description: "По одному объекту на каждый критерий из спецификации.",
          items: {
            type: "object",
            properties: {
              key:        { type: "string", enum: spec.criteria.map(c => c.key) },
              score:      { type: "integer", minimum: 0, maximum: 100, description: "Насколько кандидат соответствует критерию (0-100)." },
              evidence:   { type: "string", description: "Короткая цитата/перефраз из резюме, подтверждающая оценку. Если данных нет — «нет данных в резюме»." },
              confidence: { type: "string", enum: ["low", "medium", "high"], description: "Уверенность в оценке исходя из полноты данных." },
            },
            required: ["key", "score", "evidence", "confidence"],
          },
        },
        knockoutHit: {
          type: ["string", "null"],
          description: "Название сработавшего жёсткого стоп-фактора (если кандидат явно ему соответствует), иначе null.",
        },
        summary: { type: "string", description: "1-2 предложения: вывод по кандидату." },
      },
      required: ["criteria", "summary"],
    } as Anthropic.Tool.InputSchema,
  }
}

function buildSpecText(spec: ScoringSpec): string {
  const lines: string[] = []
  lines.push(`ВАКАНСИЯ: ${spec.vacancyTitle}`)
  lines.push(`\nОПИСАНИЕ ДОЛЖНОСТИ:\n${spec.positionSummary}`)
  if (spec.requiredSkills.length) lines.push(`\nОБЯЗАТЕЛЬНЫЕ НАВЫКИ: ${spec.requiredSkills.join(", ")}`)
  if (spec.niceSkills?.length)    lines.push(`ЖЕЛАТЕЛЬНЫЕ НАВЫКИ: ${spec.niceSkills.join(", ")}`)
  if (spec.idealProfile)          lines.push(`\nИДЕАЛЬНЫЙ КАНДИДАТ: ${spec.idealProfile}`)
  if (spec.minExperienceYears != null) lines.push(`МИНИМАЛЬНЫЙ ОПЫТ: ${spec.minExperienceYears} лет`)
  if (spec.salaryFrom || spec.salaryTo) lines.push(`ЗАРПЛАТНАЯ ВИЛКА: ${spec.salaryFrom ?? "?"}–${spec.salaryTo ?? "?"} ₽`)
  if (spec.location)   lines.push(`ЛОКАЦИЯ: ${spec.location}`)
  if (spec.workFormat) lines.push(`ФОРМАТ РАБОТЫ: ${spec.workFormat}`)
  if (spec.knockouts?.length) lines.push(`\nЖЁСТКИЕ СТОП-ФАКТОРЫ (если применимо к кандидату — knockoutHit):\n- ${spec.knockouts.join("\n- ")}`)
  lines.push(`\nКРИТЕРИИ ОЦЕНКИ (оцени каждый 0-100):`)
  for (const c of spec.criteria) {
    lines.push(`- [${c.key}] ${c.label}${c.hint ? ` — ${c.hint}` : ""} (вес: ${WEIGHT_LABELS[c.weight]})`)
  }
  return lines.join("\n")
}

const SYSTEM_INTRO = `Ты — строгий HR-аналитик. Сопоставляешь резюме кандидата со спецификацией вакансии и оцениваешь соответствие по каждому критерию отдельно.

Правила:
- Оценивай ТОЛЬКО по фактам из резюме. Нет данных по критерию → score низкий и confidence "low", evidence "нет данных в резюме". НЕ придумывай.
- evidence — короткая конкретная цитата/перефраз из резюме (не общие слова).
- score 0-100 по каждому критерию независимо от его веса (вес учтём отдельно).
- knockoutHit заполняй только если кандидат ЯВНО попадает под жёсткий стоп-фактор.
- Верни результат ТОЛЬКО через инструмент submit_assessment.

${AI_SAFETY_PROMPT}`

function verdictFromTotal(total: number): Verdict {
  if (total >= 75) return "strong"
  if (total >= 55) return "maybe"
  if (total >= 35) return "weak"
  return "weak"
}

export async function scoreResumeRubric(
  spec: ScoringSpec,
  resumeText: string,
  opts?: { model?: string },
): Promise<RubricResult> {
  const model = opts?.model ?? MODEL
  const specText = buildSpecText(spec)
  const client = getScoringClient()

  const response = await client.messages.create({
    model,
    max_tokens: 2000,
    tools: [buildTool(spec)],
    tool_choice: { type: "tool", name: "submit_assessment" },
    // Спецификация вакансии — в системном блоке с cache_control: одинакова для
    // всех кандидатов вакансии, поэтому кэшируется и не пересылается каждый раз.
    system: [
      { type: "text", text: SYSTEM_INTRO },
      { type: "text", text: specText, cache_control: { type: "ephemeral" } },
    ],
    messages: [
      { role: "user", content: `РЕЗЮМЕ КАНДИДАТА:\n\n${resumeText}` },
    ],
  })

  const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
  if (!toolUse) throw new Error("Модель не вернула структурированную оценку")

  const out = toolUse.input as {
    criteria: Array<{ key: string; score: number; evidence: string; confidence: Confidence }>
    knockoutHit?: string | null
    summary: string
  }

  // Сопоставляем ответ модели с критериями спецификации (label + weight из spec).
  const byKey = new Map(out.criteria.map(c => [c.key, c]))
  const criteria: CriterionResult[] = spec.criteria.map(c => {
    const r = byKey.get(c.key)
    return {
      key: c.key,
      label: c.label,
      weight: c.weight,
      score: r ? Math.max(0, Math.min(100, Math.round(r.score))) : 0,
      evidence: r?.evidence ?? "нет данных в резюме",
      confidence: r?.confidence ?? "low",
    }
  })

  // Взвешенная сумма — В КОДЕ. Критерии с весом «не важно» (0) не влияют.
  let weightedSum = 0
  let weightTotal = 0
  for (const c of criteria) {
    const w = WEIGHT_VALUES[c.weight]
    weightedSum += c.score * w
    weightTotal += w
  }
  let total = weightTotal > 0 ? Math.round(weightedSum / weightTotal) : 0

  const knockoutHit = out.knockoutHit && out.knockoutHit.trim() ? out.knockoutHit.trim() : null
  let verdict: Verdict
  if (knockoutHit) {
    total = 0
    verdict = "reject"
  } else {
    verdict = verdictFromTotal(total)
  }

  const usage = response.usage as Anthropic.Usage & {
    cache_creation_input_tokens?: number
    cache_read_input_tokens?: number
  }

  return {
    total,
    verdict,
    knockoutHit,
    criteria,
    summary: out.summary,
    model,
    cache: {
      creationTokens: usage.cache_creation_input_tokens ?? 0,
      readTokens: usage.cache_read_input_tokens ?? 0,
    },
  }
}
