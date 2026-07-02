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
// Для portrait-scoring вакансий читает критерии из Spec (vacancy_specs),
// для остальных — из requirementsJson.must_have (legacy путь, без изменений).

import { eq, and, desc } from "drizzle-orm"
import Anthropic from "@anthropic-ai/sdk"
import { db } from "@/lib/db"
import {
  candidates,
  vacancies,
  companies,
  demos,
  DEFAULT_SCORING_WEIGHTS,
  type CandidateScoreV2,
  type ScoringWeights,
  type VacancyRequirements,
} from "@/lib/db/schema"
import { getClaudeApiUrl } from "@/lib/claude-proxy"
import { addVacancyTokens } from "@/lib/ai/token-usage"
import { buildExtractFactsPrompt } from "@/lib/ai/prompts/extract-facts"
import { buildCompareRequirementsPrompt } from "@/lib/ai/prompts/compare-requirements"
import {
  buildBlockMap,
  normalizeAnswers,
} from "@/lib/ai-score-candidate"
import { getSpec } from "@/lib/core/spec/store"
import {
  mustHaveTexts,
  niceToHaveTexts,
  dealBreakerTexts,
} from "@/lib/core/spec/types"
import { AI_MODEL_MAIN } from "@/lib/ai/models"

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
  blockMap:        ReturnType<typeof buildBlockMap>
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
  // Use normalizeAnswers to produce human-readable «вопрос → ответ» instead of raw blockId+object JSON
  const normalizedAnketa = normalizeAnswers(args.anketaAnswers, args.blockMap)
  if (normalizedAnketa.length > 0) {
    const answersText = normalizedAnketa
      .map(a => `  ${a.question}: ${a.answer}`)
      .join("\n")
    lines.push(`Ответы на квалификационные вопросы:\n${answersText}`)
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
      portraitScoring:  vacancies.portraitScoring,
    })
    .from(vacancies)
    .where(eq(vacancies.id, vacancyId))
    .limit(1)
  if (!vacancy) throw new Error("Вакансия не найдена")

  // ── Выбираем источник критериев ─────────────────────────────────────────────
  // Для portrait-scoring вакансий критерии живут в Spec (vacancy_specs.spec),
  // а не в requirementsJson. Для остальных — только legacy requirementsJson.
  let mustHave:   string[]
  let niceToHave: string[]
  let dealBreakers: string[]
  let idealProfile: string
  let weights: ScoringWeights

  if (vacancy.portraitScoring) {
    // ── Portrait path: читаем Spec ─────────────────────────────────────────
    const spec = await getSpec(vacancyId)

    if (spec) {
      // Нормализуем union-типы (string | { text, ... }) в плоские строки.
      mustHave    = mustHaveTexts(spec.mustHave)
      // niceToHave в Spec: spec.niceToHave + spec.customCriteria[].label +
      // portraitRequiredSkills (fallback для portrait v1 без v2-mustHave).
      niceToHave  = [
        ...niceToHaveTexts(spec.niceToHave),
        // customCriteria — произвольные HR-оси, передаём как nice-to-have
        ...(spec.customCriteria ?? []).map(c => c.label),
        // portraitRequiredSkills — v1-навыки; если mustHave не пустой они
        // уже включены туда, дублирование не страшно — AI проигнорирует.
        ...(mustHave.length === 0 ? spec.portraitRequiredSkills : []),
      ]
      dealBreakers = dealBreakerTexts(spec.dealBreakers)
      idealProfile = spec.idealProfile ?? ""
      weights      = spec.scoringWeights ?? DEFAULT_SCORING_WEIGHTS

      // Гейт: пропускаем только если вообще нет ни одного критерия.
      // Portrait-вакансия с только nice-to-have / customCriteria — тоже скорим.
      const hasAnyCriteria =
        mustHave.length > 0 ||
        niceToHave.length > 0 ||
        dealBreakers.length > 0
      if (!hasAnyCriteria) return null
    } else {
      // Spec не сохранён → нет данных для portrait-скоринга, пропускаем.
      return null
    }
  } else {
    // ── Legacy path: requirementsJson (без изменений) ──────────────────────
    const req = (vacancy.requirementsJson ?? {}) as VacancyRequirements
    mustHave = req.must_have ?? []
    if (mustHave.length === 0) return null

    niceToHave   = req.nice_to_have ?? []
    dealBreakers = req.deal_breakers ?? []
    idealProfile = req.ideal_profile ?? ""
    weights      = req.scoring_weights ?? DEFAULT_SCORING_WEIGHTS
  }

  const [company] = await db
    .select({ industry: companies.industry })
    .from(companies)
    .where(eq(companies.id, vacancy.companyId))
    .limit(1)

  // Fetch demo lessons to build blockId→Block map for human-readable anketa answers
  const [demoRow] = await db
    .select({ lessonsJson: demos.lessonsJson })
    .from(demos)
    .where(and(eq(demos.vacancyId, vacancyId), eq(demos.kind, "demo")))
    .orderBy(desc(demos.updatedAt))
    .limit(1)
  const blockMap = buildBlockMap(demoRow?.lessonsJson)

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
    blockMap,
  })

  // ── Pass 1: extract facts ───────────────────────────────────────────
  const extractPrompt = buildExtractFactsPrompt({
    vacancyTitle:    vacancy.title,
    vacancyIndustry: company?.industry ?? null,
    resumeText,
  })

  const extractMsg = await anthropic.messages.create({
    model:       AI_MODEL_MAIN,
    thinking: { type: "disabled" },
    max_tokens:  1500,
    messages:    [{ role: "user", content: extractPrompt }],
  })
  void addVacancyTokens(vacancyId, extractMsg.usage)
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
    model:       AI_MODEL_MAIN,
    thinking: { type: "disabled" },
    max_tokens:  1500,
    messages:    [{ role: "user", content: comparePrompt }],
  })
  void addVacancyTokens(vacancyId, compareMsg.usage)
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
