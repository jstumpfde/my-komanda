// Группа 25: двухпроходный AI-скоринг v2.
// Pass 1: extract facts (lib/ai/prompts/extract-facts.ts).
// Pass 2: compare to requirements (lib/ai/prompts/compare-requirements.ts).
//
// Финальный score = sum(criteria_scores[k] * scoring_weights[k] / 100),
// округлённый до целого. Decision-thresholds — внутри AI ответа Pass 2,
// но мы доверяем им только если score консистентен (см. normaliseDecision).
//
// Используется параллельно с v1 (scoreCandidateById) в /api/vacancies/[id]/
// score-candidate и /api/public/demo/[token]/answer (fire-and-forget).
// Запускается ТОЛЬКО если vacancy.requirementsJson.must_have не пустой.

import { eq, and } from "drizzle-orm"
import Anthropic from "@anthropic-ai/sdk"
import { db } from "@/lib/db"
import {
  candidates,
  vacancies,
  companies,
  DEFAULT_SCORING_WEIGHTS,
  type CandidateScoreV2,
  type ScoringWeights,
  type VacancyRequirements,
} from "@/lib/db/schema"
import { getClaudeApiUrl } from "@/lib/claude-proxy"
import { buildExtractFactsPrompt } from "@/lib/ai/prompts/extract-facts"
import { buildCompareRequirementsPrompt } from "@/lib/ai/prompts/compare-requirements"

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: getClaudeApiUrl(),
})

type ExtractedFacts = CandidateScoreV2["extracted_facts"]
type CriteriaScores = CandidateScoreV2["criteria_scores"]

interface ComparisonResult {
  score: number
  decision: CandidateScoreV2["decision"]
  criteria_scores: CriteriaScores
  reasoning: CandidateScoreV2["reasoning"]
  matched_must_have: string[]
  missed_must_have: string[]
  matched_nice_to_have: string[]
  triggered_deal_breakers: string[]
}

function parseJsonFromText<T>(text: string): T {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error("Ответ AI не содержит JSON")
  return JSON.parse(match[0]) as T
}

function deriveDecision(score: number): CandidateScoreV2["decision"] {
  if (score >= 80) return "strong_match"
  if (score >= 60) return "match"
  if (score >= 40) return "maybe"
  if (score >= 20) return "weak"
  return "reject"
}

function computeWeightedScore(criteria: CriteriaScores, weights: ScoringWeights): number {
  const keys = Object.keys(weights) as (keyof ScoringWeights)[]
  const totalWeight = keys.reduce((sum, k) => sum + (weights[k] ?? 0), 0)
  if (totalWeight === 0) return 0
  const raw = keys.reduce((sum, k) => sum + (criteria[k] ?? 0) * (weights[k] ?? 0) / totalWeight, 0)
  return Math.max(0, Math.min(100, Math.round(raw)))
}

function buildResumeText(args: {
  name:            string
  city:            string | null
  experience:      string | null
  experienceYears: number | null
  skills:          string[] | null
  keySkills:       string[] | null
  industry:        string | null
  educationLevel:  string | null
  languages:       string[] | null
  workFormat:      string | null
  salaryMin:       number | null
  salaryMax:       number | null
  surveyResponses: unknown
  anketaAnswers:   unknown
}): string {
  const lines: string[] = []
  lines.push(`Имя: ${args.name}`)
  if (args.city) lines.push(`Город: ${args.city}`)
  if (args.experienceYears != null) lines.push(`Общий опыт: ${args.experienceYears} лет`)
  if (args.experience) lines.push(`Опыт работы:\n${args.experience}`)
  if (args.industry) lines.push(`Индустрия: ${args.industry}`)
  if (args.keySkills?.length) lines.push(`Ключевые навыки: ${args.keySkills.join(", ")}`)
  if (args.skills?.length) lines.push(`Навыки: ${args.skills.join(", ")}`)
  if (args.educationLevel) lines.push(`Образование: ${args.educationLevel}`)
  if (args.languages?.length) lines.push(`Языки: ${args.languages.join(", ")}`)
  if (args.workFormat) lines.push(`Формат работы: ${args.workFormat}`)
  if (args.salaryMin != null || args.salaryMax != null) {
    lines.push(`Ожидаемая зарплата: ${args.salaryMin ?? "?"} – ${args.salaryMax ?? "?"}`)
  }
  if (args.surveyResponses && typeof args.surveyResponses === "object") {
    try {
      lines.push(`Данные финальной анкеты:\n${JSON.stringify(args.surveyResponses, null, 2)}`)
    } catch { /* ignore */ }
  }
  if (Array.isArray(args.anketaAnswers) && args.anketaAnswers.length > 0) {
    try {
      lines.push(`Ответы на квалификационные вопросы:\n${JSON.stringify(args.anketaAnswers, null, 2)}`)
    } catch { /* ignore */ }
  }
  return lines.join("\n")
}

export interface ScoreCandidateV2Args {
  candidateId: string
  vacancyId:   string
  /** Skip if candidate.aiScoreV2 already set. */
  skipIfScored?: boolean
}

/**
 * Запуск двухпроходного скоринга v2. Возвращает null если у вакансии нет
 * структурированных требований (нет must_have) — в этом случае надо использовать v1.
 *
 * Throws на любую "жёсткую" ошибку (модель не ответила, JSON битый).
 * Не пишет в БД (это делает caller, чтобы синхронизировать с v1).
 */
export async function scoreCandidateV2(
  args: ScoreCandidateV2Args,
): Promise<CandidateScoreV2 | null> {
  const { candidateId, vacancyId, skipIfScored } = args

  const [candidate] = await db
    .select()
    .from(candidates)
    .where(and(eq(candidates.id, candidateId), eq(candidates.vacancyId, vacancyId)))
    .limit(1)
  if (!candidate) throw new Error("Кандидат не найден")
  if (skipIfScored && candidate.aiScoreV2 != null) return null

  const [vacancy] = await db
    .select({
      id:               vacancies.id,
      title:            vacancies.title,
      companyId:        vacancies.companyId,
      requirementsJson: vacancies.requirementsJson,
    })
    .from(vacancies)
    .where(eq(vacancies.id, vacancyId))
    .limit(1)
  if (!vacancy) throw new Error("Вакансия не найдена")

  const req = (vacancy.requirementsJson ?? {}) as VacancyRequirements
  const mustHave = req.must_have ?? []
  if (mustHave.length === 0) return null

  const niceToHave   = req.nice_to_have ?? []
  const dealBreakers = req.deal_breakers ?? []
  const idealProfile = req.ideal_profile ?? ""
  const weights      = req.scoring_weights ?? DEFAULT_SCORING_WEIGHTS

  const [company] = await db
    .select({ industry: companies.industry })
    .from(companies)
    .where(eq(companies.id, vacancy.companyId))
    .limit(1)

  const resumeText = buildResumeText({
    name:            candidate.name,
    city:            candidate.city,
    experience:      candidate.experience,
    experienceYears: candidate.experienceYears,
    skills:          candidate.skills,
    keySkills:       candidate.keySkills,
    industry:        candidate.industry,
    educationLevel:  candidate.educationLevel,
    languages:       candidate.languages,
    workFormat:      candidate.workFormat,
    salaryMin:       candidate.salaryMin,
    salaryMax:       candidate.salaryMax,
    surveyResponses: candidate.surveyResponses,
    anketaAnswers:   candidate.anketaAnswers,
  })

  // ── Pass 1: extract facts ───────────────────────────────────────────
  const extractPrompt = buildExtractFactsPrompt({
    vacancyTitle:    vacancy.title,
    vacancyIndustry: company?.industry ?? null,
    resumeText,
  })

  const extractMsg = await anthropic.messages.create({
    model:       "claude-sonnet-4-6",
    max_tokens:  1500,
    temperature: 0,
    messages:    [{ role: "user", content: extractPrompt }],
  })
  const extractText = extractMsg.content.find(b => b.type === "text")
  if (!extractText || extractText.type !== "text") {
    throw new Error("v2 Pass 1: AI не ответил")
  }
  const facts = parseJsonFromText<ExtractedFacts>(extractText.text)

  // ── Pass 2: compare to requirements ─────────────────────────────────
  const comparePrompt = buildCompareRequirementsPrompt({
    factsJson:      JSON.stringify(facts, null, 2),
    mustHave,
    niceToHave,
    dealBreakers,
    idealProfile,
    scoringWeights: weights,
  })

  const compareMsg = await anthropic.messages.create({
    model:       "claude-sonnet-4-6",
    max_tokens:  1500,
    temperature: 0,
    messages:    [{ role: "user", content: comparePrompt }],
  })
  const compareText = compareMsg.content.find(b => b.type === "text")
  if (!compareText || compareText.type !== "text") {
    throw new Error("v2 Pass 2: AI не ответил")
  }
  const comparison = parseJsonFromText<ComparisonResult>(compareText.text)

  // Финальный score считаем сами по весам — не доверяем модели в арифметике.
  const finalScore = computeWeightedScore(comparison.criteria_scores, weights)
  // Если deal-breaker сработал — максимум 30 (правило промпта).
  const cappedScore = comparison.triggered_deal_breakers.length > 0
    ? Math.min(30, finalScore)
    : finalScore

  return {
    score:    cappedScore,
    decision: deriveDecision(cappedScore),
    extracted_facts:         facts,
    criteria_scores:         comparison.criteria_scores,
    reasoning:               comparison.reasoning,
    matched_must_have:       comparison.matched_must_have ?? [],
    missed_must_have:        comparison.missed_must_have ?? [],
    matched_nice_to_have:    comparison.matched_nice_to_have ?? [],
    triggered_deal_breakers: comparison.triggered_deal_breakers ?? [],
    scored_at:               new Date().toISOString(),
  }
}
