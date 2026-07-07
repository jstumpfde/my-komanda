// Группа 25: POST /api/modules/hr/vacancies/[id]/requirements/suggest
// AI генерирует предложение must_have / nice_to_have / deal_breakers /
// ideal_profile из описания вакансии. НЕ сохраняет — HR подтверждает
// через PUT /requirements.

import { NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import Anthropic from "@anthropic-ai/sdk"
import { db } from "@/lib/db"
import { vacancies, companies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { getClaudeApiUrl } from "@/lib/claude-proxy"
import { buildSuggestRequirementsPrompt } from "@/lib/ai/prompts/suggest-requirements"
import {
  cleanArray,
  cleanWeightedArray,
  type WeightedNiceToHave,
} from "@/lib/ai/prompts/suggest-requirements-parse"
import { addVacancyTokens } from "@/lib/ai/token-usage"
import { AI_MODEL_MAIN } from "@/lib/ai/models"
import { checkAiRateLimit } from "@/lib/ai-safety"
import { checkRateLimit } from "@/lib/rate-limit"

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: getClaudeApiUrl(),
})

interface SuggestionResult {
  must_have:      string[]
  nice_to_have:   WeightedNiceToHave[]
  deal_breakers:  string[]
  ideal_profile:  string
}

function descriptionToText(descJson: unknown, fallback: string | null): string {
  if (typeof fallback === "string" && fallback.trim()) return fallback
  if (!descJson || typeof descJson !== "object") return ""
  const obj = descJson as Record<string, unknown>
  // Собираем все строковые поля и значения секций — даём AI больше контекста.
  const parts: string[] = []
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string" && v.trim()) parts.push(`${k}: ${v}`)
    else if (v && typeof v === "object") {
      try { parts.push(`${k}: ${JSON.stringify(v)}`) } catch { /* ignore */ }
    }
  }
  return parts.join("\n")
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const tenantId = user.companyId || user.id || "default"
    if (!checkRateLimit(`requirements-suggest:${tenantId}`, 20, 60_000)) {
      return apiError("Слишком частые запросы. Подождите несколько секунд.", 429)
    }
    const dailyLimit = checkAiRateLimit(tenantId)
    if (dailyLimit) return apiError(dailyLimit.message, 429)

    const [vacancy] = await db
      .select({
        id:              vacancies.id,
        title:           vacancies.title,
        description:     vacancies.description,
        descriptionJson: vacancies.descriptionJson,
        companyId:       vacancies.companyId,
      })
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)
    if (!vacancy) return apiError("Vacancy not found", 404)

    const [company] = await db
      .select({ industry: companies.industry })
      .from(companies)
      .where(eq(companies.id, vacancy.companyId))
      .limit(1)

    const descText = descriptionToText(vacancy.descriptionJson, vacancy.description)
    if (!descText.trim()) {
      return apiError("Описание вакансии пустое — нечего анализировать", 400)
    }

    const prompt = buildSuggestRequirementsPrompt({
      vacancyTitle:       vacancy.title,
      vacancyIndustry:    company?.industry ?? null,
      vacancyDescription: descText,
    })

    const message = await anthropic.messages.create({
      model:       AI_MODEL_MAIN,
      thinking: { type: "disabled" },
      max_tokens:  1200,
      messages:    [{ role: "user", content: prompt }],
    })

    void addVacancyTokens(id, message.usage)
    const textBlock = message.content.find(b => b.type === "text")
    if (!textBlock || textBlock.type !== "text") {
      return apiError("AI не вернул ответ", 500)
    }

    // Сырой ответ AI: nice_to_have может прийти как [{text,weight}] (ожидаемо)
    // ИЛИ как string[] (легаси-формат/AI недослушал схему) — cleanWeightedArray
    // принимает оба, поэтому здесь типизируем широко.
    let parsed: {
      must_have?:     unknown
      nice_to_have?:  unknown
      deal_breakers?: unknown
      ideal_profile?: unknown
    }
    try {
      const match = textBlock.text.match(/\{[\s\S]*\}/)
      parsed = JSON.parse(match ? match[0] : textBlock.text) as typeof parsed
    } catch {
      return apiError("AI вернул невалидный JSON", 500)
    }

    const suggestion: SuggestionResult = {
      must_have:     cleanArray(parsed.must_have, 5),
      nice_to_have:  cleanWeightedArray(parsed.nice_to_have, 5),
      deal_breakers: cleanArray(parsed.deal_breakers, 3),
      ideal_profile: typeof parsed.ideal_profile === "string"
        ? parsed.ideal_profile.trim().slice(0, 500)
        : "",
    }

    // Помечаем что было AI suggestion (HR редактирование через PUT затем
    // выставит hr_edited_after_suggestion=true).
    await db
      .update(vacancies)
      .set({
        requirementsJson: {
          ...((vacancy as { requirementsJson?: Record<string, unknown> }).requirementsJson ?? {}),
          ai_suggested_at: new Date().toISOString(),
        },
        updatedAt: new Date(),
      })
      .where(eq(vacancies.id, id))

    return apiSuccess({ suggestion })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[suggest requirements]", err)
    return apiError(err instanceof Error ? err.message : "Internal server error", 500)
  }
}
