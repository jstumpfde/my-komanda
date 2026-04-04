import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import Anthropic from "@anthropic-ai/sdk"

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

interface AnketaAnswer {
  question: string
  answer: string
}

interface ScoringDetail {
  question: string
  score: number
  comment: string
}

interface ScoringResult {
  score: number
  summary: string
  details: ScoringDetail[]
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCompany()
    const { id: vacancyId } = await params

    const body = await req.json() as { candidateId: string }
    if (!body.candidateId) {
      return apiError("candidateId обязательно", 400)
    }

    // Загружаем вакансию с анкетой
    const [vacancy] = await db
      .select({
        id: vacancies.id,
        title: vacancies.title,
        descriptionJson: vacancies.descriptionJson,
      })
      .from(vacancies)
      .where(and(eq(vacancies.id, vacancyId), eq(vacancies.companyId, user.companyId)))
      .limit(1)

    if (!vacancy) {
      return apiError("Вакансия не найдена", 404)
    }

    // Загружаем кандидата
    const [candidate] = await db
      .select()
      .from(candidates)
      .where(and(eq(candidates.id, body.candidateId), eq(candidates.vacancyId, vacancyId)))
      .limit(1)

    if (!candidate) {
      return apiError("Кандидат не найден", 404)
    }

    // Получаем анкету вакансии
    const descJson = vacancy.descriptionJson as Record<string, unknown> | null
    const anketa = descJson?.anketa as Record<string, unknown> | undefined

    // Собираем требования из анкеты
    const requirements: string[] = []
    if (anketa?.positionTitle) requirements.push(`Должность: ${anketa.positionTitle}`)
    if (anketa?.requiredSkills) requirements.push(`Требуемые навыки: ${(anketa.requiredSkills as string[]).join(", ")}`)
    if (anketa?.desiredSkills) requirements.push(`Желательные навыки: ${(anketa.desiredSkills as string[]).join(", ")}`)
    if (anketa?.experienceMin) requirements.push(`Минимальный опыт: ${anketa.experienceMin}`)
    if (anketa?.experienceIdeal) requirements.push(`Идеальный опыт: ${anketa.experienceIdeal}`)
    if (anketa?.productDescription) requirements.push(`Продукт: ${anketa.productDescription}`)

    // Желаемые параметры с весами
    const desiredParams = (anketa?.desiredParams as { id: string; label: string; enabled: boolean; weight: number }[] | undefined)
      ?.filter(p => p.enabled)
      ?.map(p => `${p.label} (вес: ${p.weight}/5)`) || []

    // Квалификационные вопросы из анкеты
    const questions = (anketa?.questions as string[]) || []

    // Ответы кандидата
    const answers = (candidate.anketaAnswers as AnketaAnswer[] | null) || []

    // Формируем данные кандидата
    const candidateInfo: string[] = []
    if (candidate.experience) candidateInfo.push(`Опыт: ${candidate.experience}`)
    if (candidate.skills?.length) candidateInfo.push(`Навыки: ${candidate.skills.join(", ")}`)
    if (candidate.city) candidateInfo.push(`Город: ${candidate.city}`)

    const prompt = `Ты — AI-рекрутер. Оцени кандидата по шкале 0-100.

ВАКАНСИЯ: ${vacancy.title}
${requirements.length > 0 ? `\nТРЕБОВАНИЯ:\n${requirements.join("\n")}` : ""}
${desiredParams.length > 0 ? `\nЖЕЛАЕМЫЕ ПАРАМЕТРЫ:\n${desiredParams.join("\n")}` : ""}

ДАННЫЕ КАНДИДАТА:
Имя: ${candidate.name}
${candidateInfo.join("\n")}

${answers.length > 0 ? `ОТВЕТЫ НА КВАЛИФИКАЦИОННЫЕ ВОПРОСЫ:\n${answers.map((a, i) => `${i + 1}. Вопрос: ${a.question}\n   Ответ: ${a.answer}`).join("\n\n")}` : questions.length > 0 ? `КВАЛИФИКАЦИОННЫЕ ВОПРОСЫ (ответы ещё не получены):\n${questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}` : ""}

КРИТЕРИИ ОЦЕНКИ:
1. Соответствие требованиям вакансии
2. Полнота ответов
3. Конкретность (цифры, факты, примеры)
4. Релевантность опыта

Верни ТОЛЬКО валидный JSON (без markdown):
{
  "score": <число 0-100>,
  "summary": "<резюме оценки, 4-5 предложений>",
  "details": [
    {"question": "<вопрос или критерий>", "score": <0-100>, "comment": "<комментарий>"}
  ]
}`

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    })

    // Парсим ответ
    const textBlock = message.content.find(b => b.type === "text")
    if (!textBlock || textBlock.type !== "text") {
      return apiError("Не удалось получить ответ от AI", 500)
    }

    let result: ScoringResult
    try {
      result = JSON.parse(textBlock.text) as ScoringResult
    } catch {
      return apiError("Не удалось разобрать ответ AI", 500)
    }

    // Сохраняем результат в БД
    const [updated] = await db
      .update(candidates)
      .set({
        aiScore: result.score,
        aiSummary: result.summary,
        aiDetails: result.details,
        updatedAt: new Date(),
      })
      .where(eq(candidates.id, body.candidateId))
      .returning()

    return apiSuccess({
      score: result.score,
      summary: result.summary,
      details: result.details,
      candidateId: updated.id,
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("AI scoring error:", err)
    return apiError("Ошибка AI-скоринга", 500)
  }
}
