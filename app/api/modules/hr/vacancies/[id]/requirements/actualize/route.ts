// Группа 25 (доп.): POST /api/modules/hr/vacancies/[id]/requirements/actualize
// AI «Актуализировать» — обновляет «Портрет» под изменившуюся вакансию БЕЗ
// затирания текущих критериев. На входе — ТЕКУЩИЕ критерии Портрета (передаёт
// фронт) + актуальное описание вакансии. На выходе — ДИФФ:
//   { add: { good[], bad[] }, maybe_outdated: { good[], bad[] } }
// Дедуп против текущих делается здесь же. НЕ сохраняет — HR применяет MERGE на фронте.
//
// Отличие от /requirements/suggest: suggest генерит С НУЛЯ (замена), actualize —
// аддитивный дифф (добавить новое / отметить устаревшее).

import { NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import Anthropic from "@anthropic-ai/sdk"
import { db } from "@/lib/db"
import { vacancies, companies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { getClaudeApiUrl } from "@/lib/claude-proxy"
import { buildActualizeRequirementsPrompt } from "@/lib/ai/prompts/actualize-requirements"
import { addVacancyTokens } from "@/lib/ai/token-usage"
import { AI_MODEL_MAIN } from "@/lib/ai/models"

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: getClaudeApiUrl(),
})

interface ActualizeBody {
  /** Текущие пункты «Подходит» (тексты критериев). */
  currentGood?: unknown
  /** Текущие пункты «Не подходит по смыслу» (тексты). */
  currentBad?:  unknown
}

interface ActualizeRaw {
  add_good?:             unknown
  add_bad?:              unknown
  maybe_outdated_good?:  unknown
  maybe_outdated_bad?:   unknown
}

/** Ответ роута, который читает фронт. */
interface ActualizeDiff {
  add:            { good: string[]; bad: string[] }
  maybe_outdated: { good: string[]; bad: string[] }
}

function descriptionToText(descJson: unknown, fallback: string | null): string {
  if (typeof fallback === "string" && fallback.trim()) return fallback
  if (!descJson || typeof descJson !== "object") return ""
  const obj = descJson as Record<string, unknown>
  const parts: string[] = []
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string" && v.trim()) parts.push(`${k}: ${v}`)
    else if (v && typeof v === "object") {
      try { parts.push(`${k}: ${JSON.stringify(v)}`) } catch { /* ignore */ }
    }
  }
  return parts.join("\n")
}

/** Нормализует вход (массив строк) — обрезает, дедупит регистронезависимо. */
function cleanList(input: unknown, maxItems: number, maxLen = 200): string[] {
  if (!Array.isArray(input)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of input) {
    if (typeof item !== "string") continue
    const t = item.trim()
    if (!t || t.length > maxLen) continue
    const k = t.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(t)
    if (out.length >= maxItems) break
  }
  return out
}

/**
 * Из списка-кандидата убирает всё, что уже есть среди текущих (регистронезависимо,
 * с обрезкой пробелов). Гарантирует, что «add» не предлагает дубли существующих.
 */
function dedupAgainst(candidates: string[], current: string[]): string[] {
  const existing = new Set(current.map(s => s.trim().toLowerCase()))
  const seen = new Set<string>()
  const out: string[] = []
  for (const c of candidates) {
    const k = c.trim().toLowerCase()
    if (!k || existing.has(k) || seen.has(k)) continue
    seen.add(k)
    out.push(c)
  }
  return out
}

/**
 * Из «возможно устарело» оставляет ТОЛЬКО пункты, реально присутствующие в текущих
 * (AI должен возвращать их дословно; страхуемся от галлюцинаций — фильтруем по факту).
 */
function intersectCurrent(suspected: string[], current: string[]): string[] {
  const byKey = new Map(current.map(s => [s.trim().toLowerCase(), s]))
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of suspected) {
    const k = s.trim().toLowerCase()
    const match = byKey.get(k)
    if (!match || seen.has(k)) continue
    seen.add(k)
    out.push(match) // возвращаем КАНОНИЧНЫЙ текст из текущих (чтобы фронт точно нашёл)
  }
  return out
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    let body: ActualizeBody = {}
    try { body = (await req.json()) as ActualizeBody } catch { /* пустое тело — ок */ }
    const currentGood = cleanList(body.currentGood, 30)
    const currentBad  = cleanList(body.currentBad, 30)

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

    const prompt = buildActualizeRequirementsPrompt({
      vacancyTitle:       vacancy.title,
      vacancyIndustry:    company?.industry ?? null,
      vacancyDescription: descText,
      currentGood,
      currentBad,
    })

    const message = await anthropic.messages.create({
      model:       AI_MODEL_MAIN,
      max_tokens:  1200,
      messages:    [{ role: "user", content: prompt }],
    })

    void addVacancyTokens(id, message.usage)
    const textBlock = message.content.find(b => b.type === "text")
    if (!textBlock || textBlock.type !== "text") {
      return apiError("AI не вернул ответ", 500)
    }

    let parsed: ActualizeRaw
    try {
      const match = textBlock.text.match(/\{[\s\S]*\}/)
      parsed = JSON.parse(match ? match[0] : textBlock.text) as ActualizeRaw
    } catch {
      return apiError("AI вернул невалидный JSON", 500)
    }

    // Дедуп предложений «добавить» против текущих + лимит 5 на список.
    const addGood = dedupAgainst(cleanList(parsed.add_good, 10), currentGood).slice(0, 5)
    const addBad  = dedupAgainst(cleanList(parsed.add_bad, 10), currentBad).slice(0, 5)
    // «Устарело» — только реально существующие текущие пункты.
    const outdatedGood = intersectCurrent(cleanList(parsed.maybe_outdated_good, 10), currentGood)
    const outdatedBad  = intersectCurrent(cleanList(parsed.maybe_outdated_bad, 10), currentBad)

    const diff: ActualizeDiff = {
      add:            { good: addGood, bad: addBad },
      maybe_outdated: { good: outdatedGood, bad: outdatedBad },
    }

    return apiSuccess({ diff })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[actualize requirements]", err)
    return apiError(err instanceof Error ? err.message : "Internal server error", 500)
  }
}
