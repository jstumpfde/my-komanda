// app/api/modules/hr/demo/generate/route.ts
// AI-генерация контента для демонстрации должности
// Версия 3.1 — блок-за-блоком + системные блоки + очистка markdown + demoProfile из компании

import { NextRequest } from "next/server"
import { eq, and, isNull, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies, demoTemplates, companies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import {
  DEMO_TEMPLATES,
  TONE_OPTIONS,
  FILTER_STRICTNESS,
  type DemoTemplateId,
  type ToneId,
  type FilterStrictnessId,
} from "@/lib/hr/demo-templates"
import { getClaudeMessagesUrl } from "@/lib/claude-proxy"

interface GenerateRequestBody {
  vacancyId: string
  template?: DemoTemplateId
  tone?: ToneId
  strictness?: FilterStrictnessId
  market?: string[]
  blockIndex?: number
  mode?: "single" | "all"
}

// ─── МАППИНГ БЛОКОВ ШАБЛОНОВ → БЛОКИ КОМПАНИИ ───────────────────────────────

const COMPANY_BLOCK_MAP: Record<string, string> = {
  // Long
  "l1": "company_block_greeting",
  "l2": "company_block_product",
  "l3": "company_block_market",
  "l4": "company_block_ceo",
  "l7": "company_block_stack",
  "l13": "company_block_team",
  "l16": "company_block_next",
  // Medium
  "m1": "company_block_greeting",
  "m2": "company_block_product",
  "m3": "company_block_ceo",
  "m5": "company_block_stack",
  "m10": "company_block_team",
  // Short
  "s1": "company_block_greeting",
  "s2": "company_block_product",
  "s7": "company_block_next",
}

// ─── СИСТЕМНЫЙ ПРОМТ ────────────────────────────────────────────────────────

const SYSTEM_RULES = `Ты создаёшь ОДИН блок интерактивной демонстрации должности в стиле опытного CEO-основателя, который говорит лично с сильным кандидатом.

ЭТАЛОННЫЙ СТИЛЬ:
- Живой человек, не HR-отдел и не маркетолог
- Уважает время и интеллект кандидата
- Прямо, по делу, без пафоса
- Конкретные цифры вместо общих слов
- Короткие предложения (2–4 на абзац)

ЖЁСТКИЕ ЗАПРЕТЫ (нарушение = провал):
1. НЕ используй конструкцию "не X, а Y"
2. НЕ используй триады прилагательных ("сильный, честный, основательный")
3. НЕ пиши "важно отметить", "стоит подчеркнуть"
4. НЕ используй "во-первых / во-вторых"
5. НЕ пиши HR-штампы: "динамично развивающаяся", "молодой дружный коллектив", "конкурентная заработная плата"
6. НЕ пиши инфобизнес: "раскрой потенциал", "это твой шанс"
7. НЕ используй эмодзи 🚀 ✨ 💡 🎯 🔥 ⚡ 🌟 ✅ 💪
8. "Вы" со строчной буквы
9. Восклицательных знаков — максимум 1 на блок
10. Длинное тире (—) только в "термин — пояснение", не как разделитель

ТИПОГРАФИКА:
- Диапазоны: "60 000–80 000 ₽" (с пробелами)
- Проценты: "80%" (без пробела)
- AI-термины через дефис: "AI-агенты"

СТРУКТУРА БЛОКА:
- Заголовок или якорь первой фразой
- 3-6 абзацев (ТЕКСТ ДОЛЖЕН БЫТЬ ГЛУБОКИМ, НЕ ОГРЫЗКИ)
- Буллиты для списков (3+ пунктов)
- Жирные <b>акценты</b> на ключевых фактах

HTML-ФОРМАТ:
- Каждый параграф: <p style="margin:0 0 12px 0;line-height:1.55">Текст</p>
- Списки: <ul style="margin:0 0 12px 0;padding-left:22px"><li style="margin:0 0 6px 0">Пункт</li></ul>
- Жирный: <b>текст</b>
- Разделители между смысловыми блоками: дополнительный <p> с коротким заголовком

КРИТИЧЕСКИ ВАЖНО:
- Верни ТОЛЬКО HTML-контент блока
- БЕЗ обёртки \`\`\`html или \`\`\`markdown или \`\`\`
- БЕЗ объяснений до или после
- БЕЗ тегов <html>, <body>, <head>
- Начинай сразу с <p> или <h3>`

// ─── ОЧИСТКА ОТ MARKDOWN-ОБЁРТКИ ────────────────────────────────────────────

function cleanMarkdownWrapper(text: string): string {
  let t = text.trim()
  // Убираем ```html, ```markdown, ``` в начале
  t = t.replace(/^```(?:html|markdown|md)?\s*\n?/i, "")
  // Убираем ``` в конце
  t = t.replace(/\n?```\s*$/, "")
  return t.trim()
}

// ─── ЗАГРУЗКА СИСТЕМНЫХ БЛОКОВ КОМПАНИИ ─────────────────────────────────────

async function fetchCompanyBlocks(): Promise<Map<string, string>> {
  const niches = Array.from(new Set(Object.values(COMPANY_BLOCK_MAP)))

  const rows = await db
    .select({
      niche: demoTemplates.niche,
      sections: demoTemplates.sections,
    })
    .from(demoTemplates)
    .where(
      and(
        eq(demoTemplates.isSystem, true),
        isNull(demoTemplates.tenantId),
        inArray(demoTemplates.niche, niches),
      )
    )

  const map = new Map<string, string>()
  for (const row of rows) {
    try {
      const sections = row.sections as Array<{ blocks?: Array<{ content?: string }> }>
      if (Array.isArray(sections) && sections[0]?.blocks?.[0]?.content) {
        map.set(row.niche, sections[0].blocks[0].content)
      }
    } catch {
      // skip
    }
  }

  return map
}

// ─── ПОДСТАНОВКА ПЛЕЙСХОЛДЕРОВ ──────────────────────────────────────────────

function applyPlaceholders(html: string, data: Record<string, string>): string {
  let result = html
  for (const [key, value] of Object.entries(data)) {
    const pattern = new RegExp(`\\[${key}\\]`, "g")
    if (value && value.trim()) {
      result = result.replace(pattern, value.trim())
    }
  }
  return result
}

// ─── ГЕНЕРАЦИЯ ОДНОГО БЛОКА AI ──────────────────────────────────────────────

async function generateSingleBlock(
  apiKey: string,
  blockTitle: string,
  blockDescription: string,
  context: string,
  toneHint: string,
  strictnessHint: string,
): Promise<string> {
  const prompt = `${SYSTEM_RULES}

═══ КОНТЕКСТ ═══
${context}

Тон: ${toneHint}
Жёсткость фильтра кандидатов: ${strictnessHint}

═══ ЗАДАЧА ═══
Создай блок "${blockTitle}".

Содержание блока:
${blockDescription}

ВАЖНО:
- Если данных не хватает — пиши в духе "Эту информацию вы узнаете при встрече" или оставь короткую заглушку в квадратных скобках
- Если данные есть — используй ВСЕ конкретные цифры и факты
- Длина: 3–6 абзацев, глубоко, с буллитами где уместно
- Верни ТОЛЬКО HTML-контент без любых обёрток`

  const aiRes = await fetch(getClaudeMessagesUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2500,
      messages: [{ role: "user", content: prompt }],
    }),
  })

  if (!aiRes.ok) {
    const errText = await aiRes.text()
    console.error("[demo/generate] Claude HTTP", aiRes.status, errText.slice(0, 300))
    throw new Error(`AI API error (${aiRes.status})`)
  }

  const data = (await aiRes.json()) as { content?: Array<{ type: string; text?: string }> }
  const textBlock = data.content?.find((b) => b.type === "text")
  const raw = textBlock?.text?.trim() || ""
  const cleaned = cleanMarkdownWrapper(raw)
  return cleaned || "<p>Не удалось сгенерировать контент блока.</p>"
}

// ─── ОСНОВНОЙ HANDLER ───────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = (await req.json()) as GenerateRequestBody

    if (!body.vacancyId) {
      return apiError("vacancyId is required", 400)
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return apiError("ANTHROPIC_API_KEY не настроен", 500)
    }

    // 1. Загружаем вакансию
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

    // 2. Загружаем профиль компании
    const [company] = await db
      .select({
        name: companies.name,
        companyDescription: companies.companyDescription,
        description: companies.description,
        demoProfile: companies.demoProfile,
      })
      .from(companies)
      .where(eq(companies.id, user.companyId))
      .limit(1)

    // 3. Данные анкеты
    const dj = (vacancy.descriptionJson as Record<string, unknown>) || {}
    const anketa = (dj.anketa as Record<string, unknown>) || {}
    const companyDemoProfile = (company as { demoProfile?: Record<string, string> } | undefined)?.demoProfile
    const vacancyDemoProfile = dj.demoProfile as Record<string, string> | undefined
    const demoProfile: Record<string, string> = { ...(vacancyDemoProfile || {}), ...(companyDemoProfile || {}) }

    const companyName = company?.name || String(anketa.companyName || anketa.company || "Компания")
    const companyDesc = company?.companyDescription || company?.description || String(anketa.companyDescription || "")
    const position = vacancy.title || String(anketa.position || "Должность")
    const industry = String(anketa.industry || "")
    const responsibilities = String(anketa.responsibilities || "")
    const requirements = String(anketa.requirements || "")
    const conditions = Array.isArray(anketa.conditions)
      ? (anketa.conditions as string[]).join(", ")
      : String(anketa.conditions || "")
    const bonus = String(anketa.bonus || "")
    const salary =
      vacancy.salaryMin && vacancy.salaryMax
        ? `${vacancy.salaryMin.toLocaleString("ru-RU")}–${vacancy.salaryMax.toLocaleString("ru-RU")} ₽`
        : String(anketa.salary || "")
    const city = vacancy.city || String(anketa.positionCity || "")
    const workFormats = Array.isArray(anketa.workFormats)
      ? (anketa.workFormats as string[]).join(", ")
      : ""

    // 4. Настройки генерации
    const templateId: DemoTemplateId = body.template || "medium"
    const template = DEMO_TEMPLATES.find((t) => t.id === templateId) || DEMO_TEMPLATES[1]

    const toneId: ToneId = (body.tone as ToneId) || "friendly"
    const toneHint = TONE_OPTIONS[toneId] || TONE_OPTIONS.friendly

    const strictnessId: FilterStrictnessId = (body.strictness as FilterStrictnessId) || "medium"
    const strictnessHint = FILTER_STRICTNESS[strictnessId] || FILTER_STRICTNESS.medium

    // 5. Контекст для AI
    const context = `Компания: ${companyName}${industry ? ` (отрасль: ${industry})` : ""}
${companyDesc ? `О компании: ${companyDesc}` : ""}
Должность: ${position}
Город: ${city || "не указан"}
Формат работы: ${workFormats || "не указан"}
Зарплата: ${salary || "не указана"}
Бонусы: ${bonus || "не указаны"}
Обязанности: ${responsibilities || "не указаны"}
Требования: ${requirements || "не указаны"}
Условия: ${conditions || "не указаны"}
Размер демо: ${template.label} (${template.time})`

    // 6. Плейсхолдеры
    const ceoName = String(demoProfile.ceoName || anketa.ceoName || "")
    const ceoPhotoUrl = String(demoProfile.ceoPhotoUrl || "").trim()
    const ceoPhotoHtml = ceoPhotoUrl
      ? `<p style="margin:12px 0;text-align:center"><img src="${ceoPhotoUrl}" alt="${ceoName}" style="max-width:500px;width:100%;border-radius:12px;display:inline-block"/></p>`
      : ""

    const placeholders: Record<string, string> = {
      "ДОЛЖНОСТЬ": position.toLowerCase(),
      "ФОТО_РУКОВОДИТЕЛЯ_HTML": ceoPhotoHtml,
      "ИМЯ_РУКОВОДИТЕЛЯ": ceoName,
      "ИМЯ_CEO": ceoName ? ceoName.split(" ")[0] : "CEO",
      "КРАТКАЯ_СПРАВКА": String(demoProfile.ceoShortBio || ""),
      "ОПЫТ_ЛЕТ": String(demoProfile.ceoExperience || ""),
      "ЧТО_ДЕЛАЛ": String(demoProfile.ceoBackground || ""),
      "ОТНОШЕНИЕ_К_AI": String(demoProfile.ceoAiAttitude || ""),
      "СТИЛЬ": String(demoProfile.ceoStyle || ""),
      "ЦЕННОСТИ": String(demoProfile.ceoValues || ""),
      "ГАРАНТИЯ": String(demoProfile.guarantee || anketa.bonus || ""),
      "ОКЛАД": vacancy.salaryMin ? vacancy.salaryMin.toLocaleString("ru-RU") : "",
      "ДОХОД_СРЕДНИЙ": String(demoProfile.incomeMedium || ""),
    }

    // 7. Системные блоки
    const companyBlocks = await fetchCompanyBlocks()

    // ═══ РЕЖИМ single ═══
    if (body.mode === "single" && typeof body.blockIndex === "number") {
      const blockIdx = body.blockIndex
      if (blockIdx < 0 || blockIdx >= template.blocks.length) {
        return apiError("blockIndex вне диапазона", 400)
      }

      const b = template.blocks[blockIdx]

      if (b.type === "question") {
        return apiSuccess({
          index: blockIdx,
          total: template.blocks.length,
          block: {
            type: "question",
            title: b.title,
            content: b.description,
            questionType: b.questionType || "long",
          },
        })
      }

      if (b.type === "placeholder") {
        return apiSuccess({
          index: blockIdx,
          total: template.blocks.length,
          block: {
            type: "text",
            title: b.title,
            content: `<p style="margin:0 0 12px 0;line-height:1.55;color:#666"><i>${b.description}</i></p><p style="margin:0 0 12px 0;line-height:1.55;color:#999;font-size:13px">Этот блок заполняется автоматически при прохождении демонстрации кандидатом.</p>`,
          },
        })
      }

      const companyNiche = COMPANY_BLOCK_MAP[b.id]
      if (companyNiche) {
        const systemHtml = companyBlocks.get(companyNiche)
        if (systemHtml) {
          return apiSuccess({
            index: blockIdx,
            total: template.blocks.length,
            block: {
              type: "text",
              title: b.title,
              content: applyPlaceholders(systemHtml, placeholders),
              source: "system",
            },
          })
        }
      }

      try {
        const content = await generateSingleBlock(
          apiKey,
          b.title,
          b.description,
          context,
          toneHint,
          strictnessHint,
        )
        return apiSuccess({
          index: blockIdx,
          total: template.blocks.length,
          block: {
            type: "text",
            title: b.title,
            content,
            source: "ai",
          },
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : "AI error"
        return apiError(`Ошибка генерации блока: ${msg}`, 502)
      }
    }

    // ═══ РЕЖИМ all ═══
    const blocksMeta = template.blocks.map((b, idx) => ({
      index: idx,
      id: b.id,
      title: b.title,
      type: b.type,
      description: b.description,
      source: COMPANY_BLOCK_MAP[b.id] && companyBlocks.has(COMPANY_BLOCK_MAP[b.id])
        ? "system"
        : b.type === "text" && b.ai
        ? "ai"
        : "placeholder",
    }))

    return apiSuccess({
      total: template.blocks.length,
      template: template.label,
      blocks: blocksMeta,
    })

  } catch (err) {
    if (err instanceof Response) return err
    console.error("POST /api/modules/hr/demo/generate", err)
    return apiError("Internal server error", 500)
  }
}
