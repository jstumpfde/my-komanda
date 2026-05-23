// Группа 25: GET/PUT структурированных требований вакансии.
// Используются двухпроходным AI-скорингом v2.
//
// PUT валидирует:
//   - must_have, nice_to_have, deal_breakers — массивы строк (trim, dedup)
//   - ideal_profile — строка ≤ 500 символов
//   - scoring_weights — все 9 ключей в [0, 100], сумма = 100 (если присутствует)
//
// Пустой must_have разрешён (= деактивация v2). hasRequirements проверяется
// в скоринговом endpoint'е (must_have.length > 0 → запуск A/B).

import { NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  vacancies,
  DEFAULT_SCORING_WEIGHTS,
  type ScoringWeights,
  type VacancyRequirements,
} from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

export { PUT as PATCH }

const SCORING_KEYS = Object.keys(DEFAULT_SCORING_WEIGHTS) as (keyof ScoringWeights)[]

function cleanStringArray(input: unknown, maxItems: number, maxLen = 200): string[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<string>()
  const out: string[] = []
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

function validateScoringWeights(raw: unknown): ScoringWeights | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const obj = raw as Record<string, unknown>
  const result: Partial<ScoringWeights> = {}
  for (const k of SCORING_KEYS) {
    const v = obj[k]
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 100) return undefined
    result[k] = Math.round(v)
  }
  const sum = SCORING_KEYS.reduce((s, k) => s + (result[k] ?? 0), 0)
  if (sum !== 100) return undefined
  return result as ScoringWeights
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const [row] = await db
      .select({ requirementsJson: vacancies.requirementsJson })
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)

    if (!row) return apiError("Vacancy not found", 404)
    const r = (row.requirementsJson ?? {}) as VacancyRequirements
    return apiSuccess({
      requirements: {
        must_have:       r.must_have ?? [],
        nice_to_have:    r.nice_to_have ?? [],
        deal_breakers:   r.deal_breakers ?? [],
        ideal_profile:   r.ideal_profile ?? "",
        scoring_weights: r.scoring_weights ?? DEFAULT_SCORING_WEIGHTS,
        ai_suggested_at: r.ai_suggested_at ?? null,
        hr_edited_after_suggestion: r.hr_edited_after_suggestion ?? false,
      },
    })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const body = await req.json().catch(() => ({})) as Partial<VacancyRequirements>

    const mustHave     = cleanStringArray(body.must_have, 5)
    const niceToHave   = cleanStringArray(body.nice_to_have, 5)
    const dealBreakers = cleanStringArray(body.deal_breakers, 3)
    const idealProfile = typeof body.ideal_profile === "string"
      ? body.ideal_profile.trim().slice(0, 500)
      : ""

    let weights: ScoringWeights | undefined
    if (body.scoring_weights !== undefined) {
      weights = validateScoringWeights(body.scoring_weights)
      if (!weights) {
        return apiError("scoring_weights: каждый ключ в [0,100], сумма = 100", 400)
      }
    }

    // Загружаем существующие данные чтобы сохранить ai_suggested_at + флаг
    // hr_edited_after_suggestion (если было предложение от AI и HR что-то
    // редактирует — отмечаем).
    const [existing] = await db
      .select({ requirementsJson: vacancies.requirementsJson })
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)
    if (!existing) return apiError("Vacancy not found", 404)

    const prev = (existing.requirementsJson ?? {}) as VacancyRequirements

    const next: VacancyRequirements = {
      must_have:       mustHave,
      nice_to_have:    niceToHave,
      deal_breakers:   dealBreakers,
      ideal_profile:   idealProfile,
      scoring_weights: weights ?? prev.scoring_weights ?? DEFAULT_SCORING_WEIGHTS,
      ai_suggested_at: prev.ai_suggested_at,
      hr_edited_after_suggestion: prev.ai_suggested_at
        ? true
        : prev.hr_edited_after_suggestion,
    }

    const [updated] = await db
      .update(vacancies)
      .set({ requirementsJson: next, updatedAt: new Date() })
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .returning({ id: vacancies.id, requirementsJson: vacancies.requirementsJson })

    if (!updated) return apiError("Vacancy not found", 404)
    return apiSuccess({ ok: true, requirements: updated.requirementsJson })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
