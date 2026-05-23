// Группа 25: AI-предложение структурированных требований из описания вакансии.
// Используется в /api/modules/hr/vacancies/[id]/requirements/suggest.
// model: claude-sonnet-4-6, temperature 0.3 (немного креатива).

export interface SuggestRequirementsPromptInput {
  vacancyTitle:    string
  vacancyIndustry: string | null
  vacancyDescription: string
}

export function buildSuggestRequirementsPrompt(input: SuggestRequirementsPromptInput): string {
  const { vacancyTitle, vacancyIndustry, vacancyDescription } = input
  return `Ты помощник HR. Прочитай описание вакансии и выдели структурированные требования к кандидатам.

ВАКАНСИЯ: ${vacancyTitle}
ИНДУСТРИЯ: ${vacancyIndustry ?? "не указана"}

ОПИСАНИЕ:
${vacancyDescription}

Верни JSON строго по схеме (без markdown-блоков, без префиксов):
{
  "must_have":     ["..."],
  "nice_to_have":  ["..."],
  "deal_breakers": ["..."],
  "ideal_profile": "..."
}

ПРАВИЛА:
- must_have — 3-5 коротких жёстких требований (опыт, навыки, индустрия). Конкретно.
- nice_to_have — до 5 приятных дополнений (управление, доп. навыки, языки).
- deal_breakers — до 3 что точно НЕ подходит (например "только B2C опыт",
  "без управленческого опыта" если он нужен).
- ideal_profile — короткое описание реально нужного человека (1-2 предложения, ≤ 500 символов).
- НЕ дублируй stop-factors (город, возраст, формат — это отдельно).
- Конкретные формулировки, не общие фразы типа "опытный специалист".

ВАЖНО: возвращай ТОЛЬКО валидный JSON, без комментариев.`
}
