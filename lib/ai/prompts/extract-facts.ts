// Группа 25, Pass 1 двухпроходного скоринга v2.
// Извлекает структурированные факты из резюме кандидата БЕЗ оценки —
// только нумеруемые сигналы, на которых потом считается score.

export interface ExtractFactsPromptInput {
  vacancyTitle:    string
  vacancyIndustry: string | null
  resumeText:      string
}

export function buildExtractFactsPrompt(input: ExtractFactsPromptInput): string {
  const { vacancyTitle, vacancyIndustry, resumeText } = input

  return `Ты HR-аналитик. Извлеки факты из резюме кандидата в structured JSON.

ВАКАНСИЯ: ${vacancyTitle}
ИНДУСТРИЯ ВАКАНСИИ: ${vacancyIndustry ?? "не указана"}

РЕЗЮМЕ КАНДИДАТА:
${resumeText}

Верни JSON строго по схеме (без markdown-блоков, без префиксов):
{
  "total_years_experience": number | null,
  "relevant_experience": [{ "role": "...", "years": N, "industry": "..." }],
  "industry_match": "exact" | "adjacent" | "different" | "unknown",
  "hard_skills_mentioned": ["..."],
  "soft_skills_evidence": ["..."],
  "managerial_experience": { "has": bool, "team_size": N | null },
  "avg_tenure_years": number | null,
  "company_sizes_worked": ["small" | "medium" | "large"],
  "results_with_numbers": ["..."],
  "red_flags": ["..."],
  "green_flags": ["..."],
  "education_summary": "..." | null
}

ПРАВИЛА:
- Только факты из резюме, никаких предположений.
- Если данных нет — null или [], НЕ выдумывай.
- industry_match: точно эта индустрия / соседняя / другая / непонятно.
- relevant_experience — только те роли что близки к "${vacancyTitle}".
- results_with_numbers — конкретные числа: "+40% продаж", "команда из 12 человек".
- red_flags — конкретные паттерны (3 работы за 2 года, пробелы без объяснения).
- green_flags — конкретные достижения, рекомендации, повышения.
- soft_skills_evidence — цитаты или признаки в действиях, не общие слова.
- company_sizes_worked: small (<50), medium (50-500), large (500+) если указано.

ВАЖНО: возвращай ТОЛЬКО валидный JSON, без комментариев.`
}
