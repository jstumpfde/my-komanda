// Промпт AI-скоринга кандидата по ответам анкеты (после демо).
// Используется в lib/ai-score-candidate.ts (scoreCandidateById).
//
// Принцип (#92): оцениваем РЕЛЕВАНТНОСТЬ к роли, НЕ длину ответов.
// Старый промпт штрафовал за «полноту» и «конкретность» — сильные кандидаты,
// отвечающие кратко и по делу, получали заниженные баллы. Новый промпт явно
// запрещает штрафовать за краткость и поощрять «воду».

export interface ScoreCandidatePromptInput {
  vacancyTitle:    string
  requirements:    string[]  // "Должность: ...", "Требуемые навыки: ...", и т.п.
  desiredParams:   string[]  // "Удалёнка (вес: 4/5)"
  candidateName:   string
  candidateInfo:   string[]  // "Опыт: ...", "Навыки: ...", "Город: ..."
  answers:         { question: string; answer: string }[]
  fallbackQuestions: string[] // если answers пуст — список вопросов из анкеты
}

export function buildScoreCandidatePrompt(input: ScoreCandidatePromptInput): string {
  const {
    vacancyTitle, requirements, desiredParams,
    candidateName, candidateInfo, answers, fallbackQuestions,
  } = input

  const answersBlock = answers.length > 0
    ? `ОТВЕТЫ НА КВАЛИФИКАЦИОННЫЕ ВОПРОСЫ:\n${answers.map((a, i) => `${i + 1}. Вопрос: ${a.question}\n   Ответ: ${a.answer}`).join("\n\n")}`
    : fallbackQuestions.length > 0
      ? `КВАЛИФИКАЦИОННЫЕ ВОПРОСЫ (ответы ещё не получены):\n${fallbackQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}`
      : ""

  return `Ты — AI-рекрутер. Оцени кандидата по шкале 0-100 на основе РЕЛЕВАНТНОСТИ К РОЛИ, а не длины ответов.

ВАКАНСИЯ: ${vacancyTitle}
${requirements.length > 0 ? `\nТРЕБОВАНИЯ:\n${requirements.join("\n")}` : ""}
${desiredParams.length > 0 ? `\nЖЕЛАЕМЫЕ ПАРАМЕТРЫ:\n${desiredParams.join("\n")}` : ""}

ДАННЫЕ КАНДИДАТА:
Имя: ${candidateName}
${candidateInfo.join("\n")}

${answersBlock}

КРИТИЧЕСКИЕ ПРАВИЛА:
1. Короткие точные ответы НЕ штрафуются — они часто говорят об уверенности и ясности мышления.
2. Длинные generic-ответы НЕ поощряются — это часто «вода» без содержания.
3. Оценивай: релевантный опыт, продемонстрированные навыки, соответствие требованиям роли.
4. Игнорируй: предпочтения по стилю письма, длину ответа, форматирование.

КРИТЕРИИ ОЦЕНКИ (в порядке важности):
1. Релевантный опыт под роль — 40% веса
2. Требуемые hard-навыки — 30%
3. Сигналы soft-skills и культурного фита — 20%
4. Сигналы мотивации (интерес к задаче, осознанный выбор) — 10%

Верни ТОЛЬКО валидный JSON (без markdown, без префиксов):
{
  "score": <число 0-100>,
  "summary": "<резюме оценки, 4-5 предложений>",
  "details": [
    {"question": "<вопрос или критерий>", "score": <0-100>, "comment": "<комментарий>"}
  ]
}`
}
