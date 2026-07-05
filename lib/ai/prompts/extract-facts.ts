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
- Засчитывай навык/опыт, если он ПРЯМО назван ИЛИ ОДНОЗНАЧНО следует из
  описанных задач, инструментов или результатов. Кандидаты часто не называют
  навык термином, но он явно вытекает из работы. Примеры допустимого вывода:
  • «генерировал тексты и картинки нейросетями», «автоматизировал отчёты через
    GPT», «настраивал промты для рассылок» → опыт с AI-инструментами;
  • «вёл кампании в Яндекс.Директе / РСЯ» → опыт контекстной рекламы;
  • «собирал лендинги на Tilde» → опыт лендингов/упаковки.
  Такой навык клади в hard_skills_mentioned как реальный (он подтверждён задачей).
- НО НЕ выдумывай того, чего в резюме нет ни прямо, ни по смыслу. Сомневаешься,
  есть ли основание в тексте, — НЕ добавляй. Никаких догадок «наверное умеет».
- Если данных нет — null или [].
- industry_match: точно эта индустрия / соседняя / другая / непонятно.
- relevant_experience — только те роли что близки к "${vacancyTitle}".
- results_with_numbers — конкретные числа: "+40% продаж", "команда из 12 человек".
- red_flags — конкретные паттерны (пробелы без объяснения, конфликтные уходы).
  КАЛИБРОВКА (решение владельца 05.07.2026):
  • «Частая смена работы» — red flag ТОЛЬКО при среднем сроке на месте МЕНЬШЕ
    1.5 лет. Средний срок 1.5 года и выше — рыночная норма, НЕ флаг.
  • Ожидаемая зарплата НИЖЕ вилки вакансии — НЕ red flag (для работодателя это
    нейтрально или плюс; максимум — вопрос кандидату про мотивацию). Red flag —
    только зарплата ВЫШЕ верхней границы вилки.
- green_flags — конкретные достижения, рекомендации, повышения.
- soft_skills_evidence — цитаты или признаки в действиях, не общие слова.
- company_sizes_worked: small (<50), medium (50-500), large (500+) если указано.

ВАЖНО: возвращай ТОЛЬКО валидный JSON, без комментариев.`
}
