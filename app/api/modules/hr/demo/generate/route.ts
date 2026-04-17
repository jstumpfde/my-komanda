import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { DEMO_TEMPLATES, type DemoTemplateId, type DemoTemplateBlock } from "@/lib/hr/demo-templates"
import { getClaudeMessagesUrl } from "@/lib/claude-proxy"

const TONE_HINT: Record<string, string> = {
  energetic: "энергичный — вызов и драйв",
  friendly: "дружелюбный — тёплый и поддерживающий",
  business: "деловой — факты без эмоций",
  direct: "прямой — только суть",
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = await req.json() as {
      vacancyId: string
      template?: DemoTemplateId
      tone?: string
      market?: string[]
    }

    if (!body.vacancyId) {
      return apiError("vacancyId is required", 400)
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return apiError("ANTHROPIC_API_KEY не настроен", 500)
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
    const anketa = (dj.anketa as Record<string, unknown>) || {}
    const companyName = String(anketa.companyName || anketa.company || "Компания")
    const position = vacancy.title || String(anketa.position || "Должность")
    const industry = String(anketa.industry || "")
    const responsibilities = String(anketa.responsibilities || "")
    const requirements = String(anketa.requirements || "")
    const conditions = Array.isArray(anketa.conditions) ? (anketa.conditions as string[]).join(", ") : String(anketa.conditions || "")
    const conditionsCustom = Array.isArray(anketa.conditionsCustom) ? (anketa.conditionsCustom as string[]).join(", ") : ""
    const allConditions = [conditions, conditionsCustom].filter(Boolean).join(", ")
    const bonus = String(anketa.bonus || "")
    const salary = vacancy.salaryMin && vacancy.salaryMax
      ? `${vacancy.salaryMin.toLocaleString("ru-RU")} – ${vacancy.salaryMax.toLocaleString("ru-RU")} ₽`
      : String(anketa.salary || "")
    const city = vacancy.city || String(anketa.positionCity || "")
    const workFormats = Array.isArray(anketa.workFormats) ? (anketa.workFormats as string[]).join(", ") : ""
    const requiredSkills = Array.isArray(anketa.requiredSkills) ? (anketa.requiredSkills as string[]).join(", ") : ""

    // Select template
    const templateId = body.template || "medium"
    const template = DEMO_TEMPLATES.find(t => t.id === templateId) || DEMO_TEMPLATES[1]

    // Build block descriptions for AI
    const aiBlocks = template.blocks.filter(b => b.type === "text" && b.ai)
    const blockList = aiBlocks.map((b, i) => `${i + 1}. "${b.title}" — ${b.description}`).join("\n")

    const toneText = body.tone && TONE_HINT[body.tone] ? TONE_HINT[body.tone] : "деловой — факты без эмоций"
    const marketText = Array.isArray(body.market) && body.market.length > 0 ? body.market.join(", ") : "B2B"

    const prompt = `Сгенерируй контент для демонстрации должности "${position}" в компании "${companyName}".

Данные о вакансии:
- Компания: ${companyName}${industry ? ` (${industry})` : ""}
- Должность: ${position}
- Город: ${city || "не указан"}
- Формат: ${workFormats || "не указан"}
- Зарплата: ${salary || "не указана"}
- Бонусы: ${bonus || "не указаны"}
- Обязанности: ${responsibilities || "не указаны"}
- Требования: ${requirements || "не указаны"}
- Навыки: ${requiredSkills || "не указаны"}
- Условия: ${allConditions || "не указаны"}

Параметры подачи:
- Тон: ${toneText}
- Тип рынка: ${marketText}

Нужно сгенерировать контент для ${aiBlocks.length} блоков:
${blockList}

ПРАВИЛА:
- Пиши живым деловым русским языком, от лица компании.
- Соблюдай выбранный тон во всех блоках.
- Если тип рынка указан — учитывай специфику (для B2B — длинные продажи, LTV; для B2C — массовый спрос; для B2G — тендеры, регламенты).
- Используй HTML для форматирования: <b>, <br>, <ul><li>.
- Каждый блок — 2-5 абзацев. Конкретика из данных вакансии.
- НЕ придумывай информацию которой нет в данных. Если данных нет — напиши общую формулировку.
- Для блока "Следующий шаг" — используй переменную {{имя}} для обращения к кандидату.
- Без clickbait, без "лучшая компания мира", без пустых обещаний.

Верни ТОЛЬКО валидный JSON массив (без markdown):
[
  {"id": "block_id", "content": "HTML-текст блока"}
]

Используй id из списка блоков: ${aiBlocks.map(b => b.id).join(", ")}`

    const aiContents: Record<string, string> = {}

    try {
      const aiRes = await fetch(getClaudeMessagesUrl(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 6000,
          messages: [{ role: "user", content: prompt }],
        }),
      })
      if (!aiRes.ok) {
        const errText = await aiRes.text()
        console.error("[demo/generate] Claude HTTP", aiRes.status, errText.slice(0, 300))
        return apiError(`AI API error (${aiRes.status})`, 502)
      }
      const data = await aiRes.json() as { content?: Array<{ type: string; text?: string }> }
      const textBlock = data.content?.find(b => b.type === "text")
      const text = textBlock?.text || ""
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Array<{ id: string; content: string }>
        for (const item of parsed) {
          aiContents[item.id] = item.content
        }
      }
    } catch (aiErr) {
      console.error("[demo/generate] AI error:", aiErr)
      const msg = aiErr instanceof Error ? aiErr.message : "Ошибка AI-генерации"
      return apiError(msg, 502)
    }

    // Build final blocks array
    const resultBlocks = template.blocks.map(b => {
      if (b.type === "text" && b.ai) {
        return {
          type: "text" as const,
          title: b.title,
          content: aiContents[b.id] || `<p>${b.description}</p>`,
        }
      }
      if (b.type === "question") {
        return {
          type: "question" as const,
          title: b.title,
          content: b.description,
          questionType: b.questionType || "long",
        }
      }
      // Placeholder
      return {
        type: "text" as const,
        title: b.title,
        content: `<p style="color: #999"><i>${b.description}</i></p>`,
      }
    })

    return apiSuccess(resultBlocks)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("POST /api/modules/hr/demo/generate", err)
    return apiError("Internal server error", 500)
  }
}
