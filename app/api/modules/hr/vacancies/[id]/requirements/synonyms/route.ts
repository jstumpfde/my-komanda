// POST /api/modules/hr/vacancies/[id]/requirements/synonyms
// AI генерирует 5–7 близких формулировок (синонимы/варианты написания)
// для указанного критерия «Подходит» или «Не подходит».
// НЕ сохраняет — HR добавляет нужные сам через UI.

import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import Anthropic from "@anthropic-ai/sdk"
import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { getClaudeApiUrl } from "@/lib/claude-proxy"
import { AI_MODEL_MAIN } from "@/lib/ai/models"

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: getClaudeApiUrl(),
})

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn("[synonyms] ANTHROPIC_API_KEY not set")
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return apiError("AI недоступен", 501)
  }

  try {
    const user = await requireCompany()
    const { id } = await params

    // Проверяем принадлежность вакансии компании
    const [vacancy] = await db
      .select({ id: vacancies.id, title: vacancies.title })
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)
    if (!vacancy) return apiError("Vacancy not found", 404)

    const body = await req.json().catch(() => null) as { text?: string; side?: "good" | "bad" } | null
    const text = body?.text?.trim()
    const side = body?.side ?? "good"

    if (!text) return apiError("text обязателен", 400)
    if (text.length > 300) return apiError("text слишком длинный", 400)

    const sideHint = side === "good"
      ? "Критерий находится в секции «Подходит» (плюс к баллу кандидата)."
      : "Критерий находится в секции «Не подходит» (стоп-фактор или минус к баллу)."

    // Пример в промпте — НЕЙТРАЛЬНЫЙ и side-специфичный (фидбэк Юрия 07.07:
    // для критерия «опыт маркетологом» прилетали синонимы про продажи —
    // модель цеплялась за продажный пример и не знала роли вакансии).
    const example = side === "good"
      ? `Критерий «водительские права категории B» → ["Права категории B", "Личный автомобиль", "Готовность к разъездам", "Водительское удостоверение"]`
      : `Критерий «нет профильного опыта от 2 лет» → ["Опыта по профилю нет", "Меньше 2 лет в профессии", "Без профильного стажа", "Не работал по специальности"]`

    const prompt = `Ты помогаешь HR-специалисту расширить критерий отбора кандидатов.

Вакансия: «${vacancy.title}»
Критерий: «${text}»
${sideHint}

Задача: предложи 5–7 близких формулировок ИМЕННО ЭТОГО критерия — так, как кандидаты реально пишут это в резюме на hh.ru. Учитывай варианты написания, синонимы, сокращения, смежные понятия. Держись темы критерия и роли вакансии — не подменяй тему другой профессией.

Требования к ответу:
- Только JSON массив строк, без комментариев и обёрток
- Каждая формулировка: 2–6 слов, на русском, коротко
- Не дублируй исходный критерий
- Не добавляй длинные объяснения

Пример (тема примера НЕ связана с вашей задачей — только формат):
${example}

Ответ (только JSON массив):`

    const message = await anthropic.messages.create({
      model:      AI_MODEL_MAIN,
      thinking: { type: "disabled" },
      max_tokens: 500, // запас под токенизатор Sonnet 5 (~+30%)
      messages:   [{ role: "user", content: prompt }],
    })

    const textBlock = message.content.find(b => b.type === "text")
    if (!textBlock || textBlock.type !== "text") {
      return apiError("AI не вернул ответ", 500)
    }

    let synonyms: string[]
    try {
      const match = textBlock.text.match(/\[[\s\S]*\]/)
      synonyms = JSON.parse(match ? match[0] : textBlock.text) as string[]
      if (!Array.isArray(synonyms)) throw new Error("not array")
      synonyms = synonyms
        .filter(s => typeof s === "string" && s.trim().length > 0)
        .map(s => s.trim())
        .slice(0, 7)
    } catch {
      return apiError("AI вернул невалидный JSON", 500)
    }

    return apiSuccess({ synonyms })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[synonyms]", err)
    return apiError(err instanceof Error ? err.message : "Internal server error", 500)
  }
}
