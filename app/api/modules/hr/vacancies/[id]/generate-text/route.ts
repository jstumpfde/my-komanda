import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import Anthropic from "@anthropic-ai/sdk"
import { getExamplesForNiche } from "@/lib/templates/vacancy-examples"

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

interface GenerateRequest {
  accent?: "income" | "company" | "growth"
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const [vacancy] = await db
      .select()
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)

    if (!vacancy) {
      return apiError("Вакансия не найдена", 404)
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return apiError("ANTHROPIC_API_KEY не настроен", 500)
    }

    const body = (await req.json().catch(() => ({}))) as GenerateRequest

    const desc = (vacancy.descriptionJson as Record<string, unknown>) || {}
    const category = (vacancy.category as string) || ""
    const examples = getExamplesForNiche(category)

    const examplesText = examples
      .map((e, i) => `--- Пример ${i + 1}: ${e.title} (${e.niche}) ---\n${e.text}`)
      .join("\n\n")

    const vacancyContext = [
      `Должность: ${vacancy.title || "не указана"}`,
      `Город: ${vacancy.city || "не указан"}`,
      `Формат: ${vacancy.format || "не указан"}`,
      `Занятость: ${vacancy.employment || "не указана"}`,
      `Категория: ${category || "не указана"}`,
      vacancy.salaryMin ? `Зарплата от: ${vacancy.salaryMin.toLocaleString("ru-RU")} ₽` : "",
      vacancy.salaryMax ? `Зарплата до: ${vacancy.salaryMax.toLocaleString("ru-RU")} ₽` : "",
      desc.companyDescription ? `О компании: ${desc.companyDescription}` : "",
      desc.dailyTasks ? `Задачи: ${desc.dailyTasks}` : "",
      desc.requirements ? `Требования: ${desc.requirements}` : "",
      desc.benefits ? `Преимущества: ${desc.benefits}` : "",
    ].filter(Boolean).join("\n")

    const accentMap: Record<string, string> = {
      income: "Акцент на ДОХОД: подчеркни зарплату, бонусы, систему мотивации, финансовые перспективы. Начни с финансовых условий.",
      company: "Акцент на КОМПАНИЮ: подчеркни стабильность, репутацию, корпоративную культуру, условия работы и команду. Начни с описания компании.",
      growth: "Акцент на РОСТ: подчеркни карьерные возможности, обучение, развитие навыков, менторство. Начни с перспектив роста.",
    }

    const accentInstruction = body.accent && accentMap[body.accent]
      ? accentMap[body.accent]
      : "Сбалансированный вариант — равномерно расскажи о компании, задачах, условиях и возможностях."

    const prompt = `Ты — опытный HR-копирайтер. Напиши текст вакансии на русском языке.

ДАННЫЕ О ВАКАНСИИ:
${vacancyContext}

${accentInstruction}

ПРИМЕРЫ ХОРОШИХ ТЕКСТОВ ВАКАНСИЙ:
${examplesText}

ПРАВИЛА:
- Пиши на русском, в нейтральном деловом тоне
- Используй структуру с заголовками секций (что делать, условия, требования)
- Используй маркированные списки (•)
- Длина: 150–300 слов
- Не выдумывай факты, которых нет в данных — если чего-то не указано, пропусти этот пункт
- Не начинай с «Мы ищем...» — начни с интересного для кандидата
- Текст должен быть готов к публикации на сайте вакансий

Напиши ТОЛЬКО текст вакансии, без комментариев и пояснений.`

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    })

    const generatedText = message.content
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("")

    return apiSuccess({ text: generatedText, accent: body.accent || "balanced" })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[generate-text] error:", err)
    return apiError("Ошибка генерации текста", 500)
  }
}
