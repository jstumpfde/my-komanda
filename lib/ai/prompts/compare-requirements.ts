// Группа 25, Pass 2 двухпроходного скоринга v2.
// На входе — extracted_facts (Pass 1) + requirements_json вакансии.
// На выходе — оценки по критериям и обоснование.

import type { ScoringWeights } from "@/lib/db/schema"

export interface CompareRequirementsPromptInput {
  factsJson:         string             // JSON-строка extracted_facts
  mustHave:          string[]
  niceToHave:        string[]
  dealBreakers:      string[]
  idealProfile:      string
  scoringWeights:    ScoringWeights
}

export function buildCompareRequirementsPrompt(input: CompareRequirementsPromptInput): string {
  const { factsJson, mustHave, niceToHave, dealBreakers, idealProfile, scoringWeights } = input

  const weightsText = Object.entries(scoringWeights)
    .map(([k, v]) => `  ${k}: ${v}`)
    .join("\n")

  return `Ты HR-эксперт. Оцени соответствие кандидата вакансии на основе извлечённых фактов и требований.

ИЗВЛЕЧЁННЫЕ ФАКТЫ КАНДИДАТА:
${factsJson}

ТРЕБОВАНИЯ ВАКАНСИИ:
- Must-have: ${mustHave.length > 0 ? JSON.stringify(mustHave) : "[]"}
- Nice-to-have: ${niceToHave.length > 0 ? JSON.stringify(niceToHave) : "[]"}
- Deal-breakers: ${dealBreakers.length > 0 ? JSON.stringify(dealBreakers) : "[]"}
- Ideal profile: ${idealProfile || "не указан"}

ВЕСА КРИТЕРИЕВ (сумма = 100):
${weightsText}

КРИТЕРИИ (каждый оценивается 0-100):
1. relevant_experience — насколько опыт релевантен этой роли и индустрии.
2. hard_skills — есть ли required скиллы из must_have.
3. tenure_stability — стабильность работы (длительность на одном месте).
4. results_in_numbers — есть ли конкретные цифры результатов.
5. soft_skills_fit — намёки на soft skills из ideal_profile.
6. company_size_match — работал ли в похожих по размеру компаниях.
7. managerial_match — если нужен управленческий опыт — есть ли он.
8. education — релевантность образования.
9. location_readiness — готов ли к локации/формату.

ПРАВИЛА:
- Если в одном критерии (must-have / nice-to-have) через запятую перечислено
  НЕСКОЛЬКО формулировок — это СИНОНИМЫ одного требования. Засчитывай критерий,
  если кандидат соответствует ЛЮБОЙ из формулировок (логика ИЛИ), а не требуй
  все сразу. Пример: «Опыт с AI, нейросети, ChatGPT, промпты» — достаточно
  совпадения по любому из этих слов/смыслов.
- НЕ штрафуй за краткие или прямые ответы — они часто = confidence.
- НЕ награждай за «развёрнутость» — длинные generic ответы часто = filler.
- Если deal-breaker сработал — score = max 30.
- Если все must-have подтверждены — score >= 60.
- Если 80% must-have подтверждены — score >= 50.
- score >= 80 = strong_match
- score 60-79 = match
- score 40-59 = maybe
- score 20-39 = weak
- score < 20 = reject

Верни JSON строго по схеме (без markdown-блоков, без префиксов):
{
  "score": number,
  "decision": "strong_match" | "match" | "maybe" | "weak" | "reject",
  "criteria_scores": {
    "relevant_experience": N,
    "hard_skills": N,
    "tenure_stability": N,
    "results_in_numbers": N,
    "soft_skills_fit": N,
    "company_size_match": N,
    "managerial_match": N,
    "education": N,
    "location_readiness": N
  },
  "reasoning": {
    "pros": ["...", "...", "..."],
    "cons": ["...", "..."],
    "questions_for_interview": ["...", "..."]
  },
  "matched_must_have": ["..."],
  "missed_must_have": ["..."],
  "matched_nice_to_have": ["..."],
  "triggered_deal_breakers": ["..."]
}

ВАЖНО: возвращай ТОЛЬКО валидный JSON, без комментариев.`
}
