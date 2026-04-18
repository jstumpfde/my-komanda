// app/api/modules/hr/demo/generate/route.ts
// AI-генерация контента для демонстрации должности
// Версия 3.0 — генерация по одному блоку за раз, с использованием системных блоков компании.
// Дата: 18 апреля 2026

import { NextRequest } from "next/server"
import { eq, and, isNull, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies, demoTemplates } from "@/lib/db/schema"
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

// ─── ТИПЫ ЗАПРОСА ───────────────────────────────────────────────────────────

interface GenerateRequestBody {
  vacancyId: string
  template?: DemoTemplateId
  tone?: ToneId
  strictness?: FilterStrictnessId
  market?: string[]
  blockIndex?: number  // Номер блока для генерации (0, 1, 2...)
  mode?: "single" | "all"  // single = один блок, all = весь шаблон за раз (старое поведение)
}

// ─── МАППИНГ БЛОКОВ ИЗ СИСТЕМНЫХ БЛОКОВ КОМПАНИИ ────────────────────────────

// Соответствие наших блоков шаблонов к niche системных блоков компании
const COMPANY_BLOCK_MAP: Record<string, string> = {
  // Длинный шаблон
  "l1": "company_block_greeting",      // Приветствие
  "l2": "company_block_product",       // О продукте
  "l3": "company_block_market",        // Рынок и клиенты
  "l4": "company_block_ceo",           // О руководителе
  "l7": "company_block_stack",         // Стек и инструменты
  "l13": "company_block_team",         // Команда и условия
  "l16": "company_block_next",         // Что дальше
  // Средний шаблон
  "m1": "company_block_greeting",
  "m2": "company_block_product",
  "m3": "company_block_ceo",
  "m5": "company_block_stack",
  "m10": "company_block_team",
  // Короткий шаблон
  "s1": "company_block_greeting",
  "s2": "company_block_product",
  "s7": "company_block_next",
}

// ─── СИСТЕМНЫЙ ПРОМТ: правила качества ──────────────────────────────────────

const SYSTEM_RULES = `Ты создаёшь ОДИН блок интерактивной демонстрации должности — полноценную презентацию компании и роли в стиле опытного CEO-основателя.

ЭТАЛОННЫЙ СТИЛЬ — как пишет опытный CEO в личном разговоре с сильным кандидатом. Живой человек, который уважает время и интеллект кандидата, говорит прямо и по делу.

ЖЁСТКИЕ ЗАПРЕТЫ:
1. Никаких AI-паттернов: НЕ используй "не X, а Y", триады прилагательных, "важно отметить", "во-первых/во-вторых".
2. Никаких HR-штампов: "динамично развивающаяся", "молодой дружный коллектив", "конкурентная заработная плата".
3. Никакого инфобизнеса: "раскрой потенциал", "это твой шанс", восклицательных знаков больше 1 на блок.
4. Никакого пафоса: "миссия меняющая индустрию", "лидер рынка" без доказательств.
5. Запрещённые эмодзи: 🚀 ✨ 💡 🎯 🔥 ⚡ 🌟 ✅ 💪.
6. Длинное тире (—) только в "термин — пояснение", не как разделитель.
7. "Вы" со строчной буквы.

ТИПОГРАФИКА:
- Диапазоны через длинное тире с пробелами: "60 000–80 000 ₽"
- Проценты без пробелов: "80%"
- AI-термины через дефис: "AI-агенты"

ЧТО ХОРОШО:
- Конкретные цифры вместо общих слов
- Короткие предложения (2-4 на абзац)
- Прямые формулировки
- Буллиты для списков
- Жирные акценты на ключевых фактах

ДЛИНА БЛОКА: 3–6 абзацев, с буллитами где уместно. Глубокий и содержательный, не огрызки.

ФОРМАТ: Верни ТОЛЬКО HTML-контент блока (без тегов <html>, <body>). Используй <p>, <b>, <br>, <ul><li>. Параграфы с margin и line-height inline.

Пример параграфа:
<p style="margin:0 0 12px 0;line-height:1.55">Текст абзаца.</p>`

// ─── ФУНКЦИЯ: получить системные блоки компании ─────────────────────────────

async function fetchCompanyBlocks(): Promise<Map<string, string>> {
  const niches = Object.values(COMPANY_BLOCK_MAP)
  const uniqueNiches = Array.from(new Set(niches))

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
        inArray(demoTemplates.niche, uniqueNiches),
      )
    )

  const map = new Map<string, string>()
  for (const row of rows) {
    // sections — это [lesson][block], берём первый блок первого урока
    try {
      const sections = row.sections as Array<{ blocks?: Array<{ content?: string }> }>
      if (Array.isArray(sections) && sections[0]?.blocks?.[0]?.content) {
        map.set(row.niche, sections[0].blocks[0].content)
      }
    } catch {
      // skip malformed
    }
  }

  return map
}

// ─── ФУНКЦИЯ: подставить плейсхолдеры в блок компании ───────────────────────

function applyPlaceholders(html: string, data: Record<string, string>): string {
  let result = html
  for (const [key, value] of Object.entries(data)) {
    const pattern = new RegExp(`\\[${key}\\]`, "g")
    result = result.replace(pattern, value || `[${key}]`)
  }
  return result
}

// ─── ФУНКЦИЯ: сгенерировать ОДИН блок через AI ──────────────────────────────

async function generateSingleBlock(
  apiKey: string,
  blockTitle: string,
  blockDescription: string,
  context: string,
  toneHint: string,
  strictnessHint: string,
): Promise<string> {
  const prompt = `${SYSTEM_RULES}

═══════════════════════════════════════════
КОНТЕКСТ
═══════════════════════════════════════════

${context}

Тон: ${toneHint}
Жёсткость фильтра: ${strictnessHint}

═══════════════════════════════════════════
ЗАДАЧА
═══════════════════════════════════════════

Создай блок "${blockTitle}".

ЧТО ПИШЕМ В ЭТОМ БЛОКЕ:
${blockDescription}

ВАЖНО:
- Если данных не хватает (например, для блока "О руководителе" нет имени) — напиши заглушку "[укажите эти данные]" или "Эту информацию вы узнаете при встрече".
- Если данные есть — используй ВСЕ конкретные цифры и факты.
- Длина: 3–6 абзацев, глубоко, не огрызки.

Верни ТОЛЬКО HTML-контент блока. Без объяснений до или после.`

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
  return textBlock?.text?.trim() || "<p>Не удалось сгенерировать контент блока.</p>"
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

    // 1. Загружаем данные вакансии
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

    // 2. Извлекаем анкету
    const dj = (vacancy.descriptionJson as Record<string, unknown>) || {}
    const anketa = (dj.anketa as Record<string, unknown>) || {}

    const companyName = String(anketa.companyName || anketa.company || "Компания")
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
    const companyDescription = String(anketa.companyDescription || anketa.aboutCompany || "")

    // 3. Настройки
    const templateId: DemoTemplateId = body.template || "medium"
    const template = DEMO_TEMPLATES.find((t) => t.id === templateId) || DEMO_TEMPLATES[1]

    const toneId: ToneId = (body.tone as ToneId) || "friendly"
    const toneHint = TONE_OPTIONS[toneId] || TONE_OPTIONS.friendly

    const strictnessId: FilterStrictnessId = (body.strictness as FilterStrictnessId) || "medium"
    const strictnessHint = FILTER_STRICTNESS[strictnessId] || FILTER_STRICTNESS.medium

    // 4. Общий контекст для AI-блоков
    const context = `Компания: ${companyName}${industry ? ` (отрасль: ${industry})` : ""}
${companyDescription ? `О компании: ${companyDescription}` : ""}
Должность: ${position}
Город: ${city || "не указан"}
Формат работы: ${workFormats || "не указан"}
Зарплата: ${salary || "не указана"}
Бонусы: ${bonus || "не указаны"}
Обязанности: ${responsibilities || "не указаны"}
Требования: ${requirements || "не указаны"}
Условия: ${conditions || "не указаны"}
Размер демо: ${template.label} (${template.time})`

    // 5. Плейсхолдеры для системных блоков компании
    const placeholders: Record<string, string> = {
      "ДОЛЖНОСТЬ": position.toLowerCase(),
      "ИМЯ_РУКОВОДИТЕЛЯ": String(anketa.ceoName || ""),
      "ИМЯ_CEO": String(anketa.ceoName || "CEO").split(" ")[0],
      // Остальные плейсхолдеры остаются пустыми или подставятся дефолты
    }

    // 6. Загружаем системные блоки компании
    const companyBlocks = await fetchCompanyBlocks()

    // ═══ РЕЖИМ single: генерируем ОДИН блок по blockIndex ═══
    if (body.mode === "single" && typeof body.blockIndex === "number") {
      const blockIdx = body.blockIndex
      if (blockIdx < 0 || blockIdx >= template.blocks.length) {
        return apiError("blockIndex вне диапазона", 400)
      }

      const b = template.blocks[blockIdx]

      // Если это question-блок — возвращаем как есть
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

      // Если это placeholder-блок — возвращаем описание
      if (b.type === "placeholder") {
        return apiSuccess({
          index: blockIdx,
          total: template.blocks.length,
          block: {
            type: "text",
            title: b.title,
            content: `<p style="color: #999"><i>${b.description}</i></p>`,
          },
        })
      }

      // Если это text-блок — сначала проверим системный блок компании
      const companyNiche = COMPANY_BLOCK_MAP[b.id]
      if (companyNiche) {
        const systemHtml = companyBlocks.get(companyNiche)
        if (systemHtml) {
          // Используем системный блок с подстановкой плейсхолдеров
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

      // Иначе — генерим через AI
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

    // ═══ РЕЖИМ all (по умолчанию): возвращаем метаданные для фронта ═══
    // Фронт будет вызывать single для каждого блока по очереди
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
