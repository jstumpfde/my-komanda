// POST /api/modules/hr/vacancies/[id]/portrait/check-conflicts
// AI проверяет логические противоречия между критериями «Подходит» и «Не подходит».
// Возвращает список конфликтующих пар с пояснением.

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
  console.warn("[check-conflicts] ANTHROPIC_API_KEY not set")
}

interface ConflictItem {
  good: string
  bad:  string
  why:  string
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
      .select({ id: vacancies.id })
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)
    if (!vacancy) return apiError("Vacancy not found", 404)

    const body = await req.json().catch(() => null) as { good?: string[]; bad?: string[] } | null
    const good = Array.isArray(body?.good) ? body.good.filter(s => typeof s === "string" && s.trim()) : []
    const bad  = Array.isArray(body?.bad)  ? body.bad.filter(s => typeof s === "string" && s.trim())  : []

    // Если меньше 1 критерия в каждом списке — нечего проверять
    if (good.length === 0 || bad.length === 0) {
      return apiSuccess({ conflicts: [] })
    }

    const goodList = good.map((s, i) => `${i + 1}. ${s}`).join("\n")
    const badList  = bad.map((s, i) => `${i + 1}. ${s}`).join("\n")

    const prompt = `Ты помогаешь HR-специалисту проверить критерии отбора кандидатов на противоречия.

ПОДХОДИТ (плюс к баллу):
${goodList}

НЕ ПОДХОДИТ (стоп-фактор или минус к баллу):
${badList}

Задача: найди логические противоречия — когда одно и то же качество/опыт одновременно является плюсом и минусом. Это создаёт путаницу для AI-оценщика.

Примеры противоречий:
- «B2B-опыт» в Подходит и «только B2B» в Не подходит
- «Опыт в стартапах» в Подходит и «работал только в стартапах» в Не подходит
- «Знание CRM» в Подходит и «использует CRM» в Не подходит

НЕ считай противоречием:
- разные уровни одного и того же (например, «опыт продаж» vs «нет опыта продаж» — это норма)
- разные контексты (B2B в одной сфере vs B2B в другой)
- уточняющие критерии без явного конфликта

Требования к ответу:
- Только JSON массив объектов, без комментариев
- Каждый объект: {"good": "...", "bad": "...", "why": "..."}
- "why" — одно короткое предложение на русском (до 60 символов), почему это противоречие
- Если противоречий нет — верни пустой массив []

Ответ (только JSON массив):`

    const message = await anthropic.messages.create({
      model:      AI_MODEL_MAIN,
      thinking: { type: "disabled" },
      max_tokens: 800, // запас под токенизатор Sonnet 5 (~+30%)
      messages:   [{ role: "user", content: prompt }],
    })

    const textBlock = message.content.find(b => b.type === "text")
    if (!textBlock || textBlock.type !== "text") {
      return apiError("AI не вернул ответ", 500)
    }

    let conflicts: ConflictItem[]
    try {
      const match = textBlock.text.match(/\[[\s\S]*\]/)
      conflicts = JSON.parse(match ? match[0] : textBlock.text) as ConflictItem[]
      if (!Array.isArray(conflicts)) throw new Error("not array")
      conflicts = conflicts.filter(
        c => c && typeof c.good === "string" && typeof c.bad === "string" && typeof c.why === "string",
      )
    } catch {
      return apiError("AI вернул невалидный JSON", 500)
    }

    return apiSuccess({ conflicts })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[check-conflicts]", err)
    return apiError(err instanceof Error ? err.message : "Internal server error", 500)
  }
}
