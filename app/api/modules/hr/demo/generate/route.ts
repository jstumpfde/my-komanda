import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import Anthropic from "@anthropic-ai/sdk"
import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

const client = new Anthropic()

export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = await req.json() as { vacancyId: string }

    if (!body.vacancyId) {
      return apiError("vacancyId is required", 400)
    }

    // Get vacancy data
    const [vacancy] = await db
      .select({
        id: vacancies.id,
        title: vacancies.title,
        city: vacancies.city,
        salaryMin: vacancies.salaryMin,
        salaryMax: vacancies.salaryMax,
        descriptionJson: vacancies.descriptionJson,
      })
      .from(vacancies)
      .where(and(eq(vacancies.id, body.vacancyId), eq(vacancies.companyId, user.companyId)))
      .limit(1)

    if (!vacancy) {
      return apiError("Vacancy not found", 404)
    }

    // Extract anketa data
    const dj = (vacancy.descriptionJson as Record<string, unknown>) || {}
    const anketa = (dj.anketa as Record<string, string>) || {}
    const companyName = anketa.companyName || anketa.company || "Компания"
    const position = vacancy.title || anketa.position || "Должность"
    const product = anketa.product || anketa.about || ""
    const tasks = anketa.tasks || anketa.responsibilities || ""
    const conditions = anketa.conditions || anketa.benefits || ""
    const salary = vacancy.salaryMin && vacancy.salaryMax
      ? `${vacancy.salaryMin.toLocaleString("ru-RU")} – ${vacancy.salaryMax.toLocaleString("ru-RU")} ₽`
      : anketa.salary || ""
    const city = vacancy.city || anketa.city || "Москва"

    const prompt = `Сгенерируй демонстрацию должности из 10 блоков для вакансии "${position}" в компании "${companyName}".

Данные о вакансии:
- Компания: ${companyName}
- Должность: ${position}
- Город: ${city}
- Зарплата: ${salary || "не указана"}
- Продукт/Услуга: ${product || "не указано"}
- Задачи: ${tasks || "не указаны"}
- Условия: ${conditions || "не указаны"}

Структура 10 блоков:
1. Приветствие — тёплое обращение к кандидату, представление компании
2. О компании — чем занимается, масштаб, достижения
3. О продукте/услуге — что делает компания, для кого
4. Задачи и обязанности — что будет делать кандидат каждый день
5. Условия работы — график, офис/удалёнка, бонусы, зарплата
6. План дохода — как формируется доход, рост, KPI
7. Типичный день — как выглядит рабочий день на этой позиции
8. Вопрос про опыт — открытый вопрос кандидату (textarea)
9. Вопрос про мотивацию — открытый вопрос кандидату (textarea)
10. Что дальше — объяснение следующих шагов процесса найма

Верни ТОЛЬКО валидный JSON массив (без markdown, без комментариев):
[
  {"type": "text", "title": "Заголовок блока", "content": "HTML-текст блока с <b>, <br>, <ul><li>"},
  {"type": "question", "title": "Заголовок вопроса", "content": "Текст вопроса", "questionType": "textarea"}
]

type может быть: "text" (информационный блок) или "question" (вопрос кандидату с questionType: "textarea" или "radio").
Текст пиши на русском, живым деловым языком. Используй HTML-форматирование для структуры.`

    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    })

    const text = message.content[0].type === "text" ? message.content[0].text : ""

    // Parse JSON from response (handle potential markdown wrapping)
    let blocks: Array<{ type: string; title: string; content: string; questionType?: string }>
    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (!jsonMatch) throw new Error("No JSON array found")
      blocks = JSON.parse(jsonMatch[0])
    } catch {
      return apiError("Failed to parse AI response", 500)
    }

    return apiSuccess(blocks)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("POST /api/modules/hr/demo/generate", err)
    return apiError("Internal server error", 500)
  }
}
