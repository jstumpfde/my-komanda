// R4 этап 2: построение входа screenResume() из Spec («Кого ищем»)
// вместо legacy-портрета. Используется боевым process-queue для вакансий
// из SPEC_SCORING_VACANCY_IDS (полигон) и скриптом spec-shadow-score.ts.
//
// Честное A/B 11.06.2026 (полигон «Помощник по маркетингу», 30 кандидатов,
// fresh-vs-fresh): средняя |Δ|=5, медиана 0, совпадение зон 93% — критерии
// Spec переводятся в скоринг эквивалентно legacy.

import type { CandidateSpec, NiceToHaveItem } from "@/lib/core/spec/types"
import { normalizeMustHave, normalizeNiceToHave, normalizeDealBreakers } from "@/lib/core/spec/types"
import type { ResumeScreenInput } from "@/lib/ai-screen-resume"

/** В контуре «Портрет» суффикс важности на пункте, чтобы AI взвешивал сильнее. */
function annotateImportance(n: NiceToHaveItem): string {
  if (n.importance === "very")      return `${n.text} (очень важно)`
  if (n.importance === "important") return `${n.text} (важно)`
  return n.text
}

/**
 * Строит ResumeScreenInput, подставляя критерии/стоп-факторы из Spec:
 * - idealProfile ← spec.idealProfile (v2+v1)
 * - aiRequiredHardSkills ← spec.mustHave (v2) || spec.portraitRequiredSkills (v1)
 * - aiStopFactors ← dealBreakers + portraitKnockouts + структурные стоп-факторы текстом
 * - screeningQuestions ← niceToHave || portraitNiceSkills
 * - aiWeights ← маппинг 9-осевых весов Spec → 5-ключевой формат screenResume
 */
export function buildSpecResumeInput(
  resume: ResumeScreenInput["resume"],
  vacancy: { title: string; city?: string | null },
  spec: CandidateSpec,
  opts?: { respectHardness?: boolean },
): ResumeScreenInput {
  // mustHave: union(string | { text, hard }) → нормализуем в { text, hard }.
  // respectHardness (контур «Портрет»): жёсткие пункты остаются обязательными
  // (нокаут), мягкие переходят в «желательные» — влияют на балл, не отсеивают.
  // Без флага (legacy/существующие Spec-вакансии): все пункты обязательные —
  // поведение прежнее, не меняем отбор у текущих вакансий.
  const respect = opts?.respectHardness === true
  const mhItems = normalizeMustHave(spec.mustHave)
  // Жёсткие must-have → нокаут; мягкие (только при respect) → желательные.
  const hardTexts = (respect ? mhItems.filter(i => i.hard) : mhItems).map(i => i.text)
  const softTexts = respect ? mhItems.filter(i => !i.hard).map(i => i.text) : []
  // Нокаут-навыки для движка: есть жёсткие → они; пункты есть, но все мягкие →
  // пусто (не отсеиваем); пунктов нет вовсе → v1-портрет.
  const mustHave = hardTexts.length > 0
    ? hardTexts
    : (mhItems.length > 0 ? [] : spec.portraitRequiredSkills)

  // niceToHave: union(string | { text, importance }). В контуре «Портрет»
  // (respect) добавляем суффикс важности, чтобы AI взвешивал пункт сильнее.
  const niceItems = normalizeNiceToHave(spec.niceToHave)
  const niceTexts = niceItems.length > 0
    ? niceItems.map(n => (respect ? annotateImportance(n) : n.text))
    : spec.portraitNiceSkills

  // dealBreakers: union(string | { text, hard }). hard → стоп-фактор (отказ);
  // soft (только при respect) → «нежелательно» — снижает балл, НЕ отказ.
  // Без respect (legacy/существующие Spec) все пункты = отказ, как раньше.
  const dbItems = normalizeDealBreakers(spec.dealBreakers)
  const dbHard = (respect ? dbItems.filter(i => i.hard) : dbItems).map(i => i.text)
  const dbSoft = respect ? dbItems.filter(i => !i.hard).map(i => i.text) : []

  const niceToHave = [
    ...softTexts,
    ...niceTexts,
  ]

  const knockouts = [
    ...dbHard,
    ...spec.portraitKnockouts,
  ]

  // Структурные стоп-факторы переводим в текст для AI (city/format/age/experience)
  const structuralStops: string[] = []
  const sf = spec.stopFactors
  if (sf.city?.enabled && sf.city.allowedCities?.length) {
    structuralStops.push(`Только города: ${sf.city.allowedCities.join(", ")}`)
  }
  if (sf.format?.enabled && sf.format.allowedFormats?.length) {
    structuralStops.push(`Формат работы: ${sf.format.allowedFormats.join(", ")}`)
  }
  if (sf.age?.enabled) {
    const parts: string[] = []
    if (sf.age.minAge != null) parts.push(`от ${sf.age.minAge}`)
    if (sf.age.maxAge != null) parts.push(`до ${sf.age.maxAge}`)
    if (parts.length) structuralStops.push(`Возраст: ${parts.join(" ")} лет`)
  }
  if (sf.experience?.enabled && sf.experience.minYears != null) {
    structuralStops.push(`Опыт не менее ${sf.experience.minYears} лет`)
  }

  const allKnockouts = [...knockouts, ...structuralStops]

  // 9-осевые веса Spec (0-100) → строковые уровни screenResume
  const aiWeights: Record<string, string> = {}
  const sw = spec.scoringWeights
  const toLevel = (w: number): string => {
    if (w >= 25) return "critical"
    if (w >= 15) return "important"
    if (w >= 5)  return "nice"
    return "irrelevant"
  }
  if (sw.relevant_experience > 0) aiWeights["industry_experience"] = toLevel(sw.relevant_experience)
  if (sw.hard_skills > 0) aiWeights["specific_skills"] = toLevel(sw.hard_skills)
  if (sw.managerial_match > 0) aiWeights["management"] = toLevel(sw.managerial_match)
  if (sw.education > 0) aiWeights["education"] = toLevel(sw.education)

  return {
    resume,
    vacancy: {
      title:                vacancy.title,
      city:                 vacancy.city ?? null,
      aiIdealProfile:       spec.idealProfile || null,
      aiRequiredHardSkills: mustHave.length > 0 ? mustHave : null,
      aiStopFactors:        allKnockouts.length > 0 ? allKnockouts : null,
      aiSoftAvoid:          dbSoft.length > 0 ? dbSoft : null,
      screeningQuestions:   niceToHave.length > 0 ? niceToHave : null,
      aiWeights:            Object.keys(aiWeights).length > 0 ? aiWeights : null,
    },
  }
}

/**
 * Гейт R4 этапа 2.5 (решение Юрия 11.06.2026): Spec-скоринг включён по
 * умолчанию ДЛЯ ВСЕХ вакансий, КРОМЕ перечисленных в env
 * SPEC_SCORING_LEGACY_VACANCY_IDS (uuid через запятую) — это снимок уже
 * размещённых боевых вакансий Орлинка, они оцениваются по-старому.
 *
 * Двойная страховка: даже при включённом гейте вакансия без сохранённого
 * непустого Spec оценивается legacy-путём (fallback в process-queue) —
 * по-новому реально считаются только вакансии с заполненным «Кого ищем».
 */
export function isSpecScoringEnabled(vacancyId: string): boolean {
  const legacy = process.env.SPEC_SCORING_LEGACY_VACANCY_IDS
  if (!legacy) return true
  return !legacy.split(",").map(s => s.trim()).filter(Boolean).includes(vacancyId)
}
