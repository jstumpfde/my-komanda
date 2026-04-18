// app/api/modules/hr/demo/generate/route.ts
// AI-генерация контента для демонстрации должности
// Версия 2.0 — переписана под логику эталонной v8 маркетолога
// Дата: 18 апреля 2026

import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
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
}

// ─── СИСТЕМНЫЙ ПРОМТ: правила качества (эталон v8) ──────────────────────────

const SYSTEM_RULES = `Ты создаёшь интерактивную демонстрацию должности. Это НЕ классическая вакансия с HH.ru, а полноценная презентация компании и роли, которая заменяет 2-3 первичных собеседования.

ЭТАЛОННЫЙ СТИЛЬ — как пишет опытный CEO-основатель в личном разговоре с сильным кандидатом. Не HR-менеджер, не маркетолог, не PR. Живой человек, который:
- Уважает время и интеллект кандидата
- Говорит прямо и по делу
- Не боится сложных формулировок про сложные вещи
- Не льстит, не продаёт, не пугает

ЖЁСТКИЕ ЗАПРЕТЫ (нарушение = провал генерации):
1. Никаких AI-паттернов:
   - НЕ используй конструкцию "не X, а Y" (например, "не просто работа, а вызов")
   - НЕ используй триады параллельных прилагательных ("сильный, честный, основательный")
   - НЕ пиши "важно отметить", "стоит подчеркнуть", "хочется особо выделить"
   - НЕ используй "во-первых / во-вторых / в-третьих"
2. Никаких HR-штампов:
   - "динамично развивающаяся компания"
   - "молодой дружный коллектив"
   - "конкурентная заработная плата"
   - "возможности профессионального роста"
3. Никаких инфобизнес-оборотов:
   - "раскрой свой потенциал"
   - "это твой шанс"
   - "мы ищем именно тебя"
   - восклицательных знаков больше 1 на блок
4. Никакого пафоса:
   - "миссия меняющая индустрию"
   - "лидер рынка" (если компания не реальный лидер с доказательствами)
   - "работа мечты"
5. Запрещённые эмодзи: 🚀 ✨ 💡 🎯 🔥 ⚡ 🌟 ✅ 💪 — это эмодзи инфобизнеса.
6. Длинное тире (—) используй ТОЛЬКО в роли "термин — пояснение". Не как основной разделитель.
7. "Вы" пиши со строчной буквы (массовое обращение), не с заглавной.

ТИПОГРАФИКА:
- Числовые диапазоны через длинное тире с неразрывным пробелом: "60 000–80 000 ₽"
- Проценты и числа без пробелов перед знаком: "80%", "6 месяцев"
- Название компании пиши ровно так, как оно дано в данных (с суффиксом .Pro если есть)
- AI-термины через дефис: "AI-агенты", "AI-первый", "AI-стек"

ЧТО ХОРОШО:
- Конкретные цифры вместо общих слов ("60 клиентов в месяц" вместо "хороший объём")
- Короткие предложения. Один абзац = 2-4 предложения максимум.
- Прямые формулировки: "будет тяжело, если...", "не подойдёт тем, кто..."
- Буллиты для списков, не сплошной текст
- Жирные **акценты** на ключевых фактах для сканирования с телефона

ПРИНЦИП КАЖДОГО БЛОКА:
- Кандидат читает с телефона, 10-20 секунд на блок
- Должен понять суть за первые 2 предложения
- Детали в буллитах, не в сплошном тексте
- В конце блока — плавный переход к следующему, например "Далее — о руководителе." с эмодзи ➡️`

// ─── ИНСТРУКЦИЯ ПОД КОНКРЕТНЫЙ БЛОК ─────────────────────────────────────────

function blockInstruction(blockTitle: string, blockDescription: string): string {
  return `БЛОК "${blockTitle}". ${blockDescription}`
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

    // ─── 1. Загружаем данные вакансии ───────────────────────────────────────
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

    // ─── 2. Извлекаем анкету ────────────────────────────────────────────────
    const dj = (vacancy.descriptionJson as Record<string, unknown>) || {}
    const anketa = (dj.anketa as Record<string, unknown>) || {}

    const companyName = String(anketa.companyName || anketa.company || "Компания")
    const companyDescription = String(anketa.companyDescription || anketa.aboutCompany || "")
    const position = vacancy.title || String(anketa.position || "Должность")
    const industry = String(anketa.industry || "")
    const responsibilities = String(anketa.responsibilities || "")
    const requirements = String(anketa.requirements || "")
    const conditions = Array.isArray(anketa.conditions)
      ? (anketa.conditions as string[]).join(", ")
      : String(anketa.conditions || "")
    const conditionsCustom = Array.isArray(anketa.conditionsCustom)
      ? (anketa.conditionsCustom as string[]).join(", ")
      : ""
    const allConditions = [conditions, conditionsCustom].filter(Boolean).join(", ")
    const bonus = String(anketa.bonus || "")
    const salary =
      vacancy.salaryMin && vacancy.salaryMax
        ? `${vacancy.salaryMin.toLocaleString("ru-RU")}–${vacancy.salaryMax.toLocaleString("ru-RU")} ₽`
        : String(anketa.salary || "")
    const city = vacancy.city || String(anketa.positionCity || "")
    const workFormats = Array.isArray(anketa.workFormats)
      ? (anketa.workFormats as string[]).join(", ")
      : ""
    const requiredSkills = Array.isArray(anketa.requiredSkills)
      ? (anketa.requiredSkills as string[]).join(", ")
      : ""

    // ─── 3. Настройки генерации ─────────────────────────────────────────────
    const templateId: DemoTemplateId = body.template || "medium"
    const template = DEMO_TEMPLATES.find((t) => t.id === templateId) || DEMO_TEMPLATES[1]

    const toneId: ToneId = (body.tone as ToneId) || "friendly"
    const toneHint = TONE_OPTIONS[toneId] || TONE_OPTIONS.friendly

    const strictnessId: FilterStrictnessId = (body.strictness as FilterStrictnessId) || "medium"
    const strictnessHint = FILTER_STRICTNESS[strictnessId] || FILTER_STRICTNESS.medium

    const marketText =
      Array.isArray(body.market) && body.market.length > 0 ? body.market.join(", ") : "B2B"

    // ─── 4. Фильтруем только AI-блоки ───────────────────────────────────────
    const aiBlocks = template.blocks.filter((b) => b.type === "text" && b.ai)
    const blockList = aiBlocks
      .map((b, i) => `${i + 1}. ID: "${b.id}" — ${blockInstruction(b.title, b.description)}`)
      .join("\n\n")

    // ─── 5. Собираем финальный промт ────────────────────────────────────────
    const prompt = `${SYSTEM_RULES}

═════════════════════════════════════════════════════════════
ДАННЫЕ О ВАКАНСИИ
═════════════════════════════════════════════════════════════

Компания: ${companyName}${industry ? ` (отрасль: ${industry})` : ""}
${companyDescription ? `О компании: ${companyDescription}` : ""}
Должность: ${position}
Город: ${city || "не указан"}
Формат работы: ${workFormats || "не указан"}
Зарплата: ${salary || "не указана"}
Бонусы: ${bonus || "не указаны"}
Обязанности: ${responsibilities || "не указаны"}
Требования: ${requirements || "не указаны"}
Ключевые навыки: ${requiredSkills || "не указаны"}
Условия: ${allConditions || "не указаны"}

═════════════════════════════════════════════════════════════
ПАРАМЕТРЫ ПОДАЧИ
═════════════════════════════════════════════════════════════

Тон коммуникации: ${toneHint}
Жёсткость фильтра кандидатов: ${strictnessHint}
Тип рынка: ${marketText}
Размер демонстрации: ${template.label} (${template.time})

═════════════════════════════════════════════════════════════
ЗАДАЧА
═════════════════════════════════════════════════════════════

Нужно сгенерировать HTML-контент для ${aiBlocks.length} блоков демонстрации.

ВАЖНО про контент:
- Если данных для блока НЕ ХВАТАЕТ (например, в анкете нет описания руководителя для блока "О руководителе") — пиши короткую заглушку со словами в духе "Эту информацию вы узнаете при встрече" или "[Напишите здесь о себе]". НЕ придумывай факты.
- Если данные ЕСТЬ — используй ВСЕ конкретные цифры и факты из анкеты. Не заменяй "60 000 ₽" на "достойная зарплата".
- Соблюдай выбранный тон коммуникации во всех блоках единообразно.
- Если указан тип рынка — учитывай специфику: B2B — длинные продажи, LTV, ROI; B2C — массовый спрос, конверсия; B2G — тендеры, регламенты.
- Длина блока: 3–6 абзацев, с буллитами где уместно. Избегай воды. Лучше коротко и чётко, чем длинно и размыто.
- Используй HTML: <p>, <b>, <br>, <ul><li>. Структура с жирными якорями для ключевых фраз.
- Каждый блок — самостоятельная единица. Читается независимо.

БЛОКИ ДЛЯ ГЕНЕРАЦИИ:

${blockList}

═════════════════════════════════════════════════════════════
ФОРМАТ ОТВЕТА
═════════════════════════════════════════════════════════════

Верни ТОЛЬКО валидный JSON массив (без обёртки markdown, без объяснений до или после):

[
  {"id": "${aiBlocks[0]?.id || "id_блока"}", "content": "HTML-контент блока"},
  ...
]

Используй точно эти id: ${aiBlocks.map((b) => b.id).join(", ")}

Всё. Начинай генерацию.`

    // ─── 6. Запрос к AI ─────────────────────────────────────────────────────
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
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 16000,
          messages: [{ role: "user", content: prompt }],
        }),
      })

      if (!aiRes.ok) {
        const errText = await aiRes.text()
        console.error("[demo/generate] Claude HTTP", aiRes.status, errText.slice(0, 300))
        return apiError(`AI API error (${aiRes.status})`, 502)
      }

      const data = (await aiRes.json()) as { content?: Array<{ type: string; text?: string }> }
      const textBlock = data.content?.find((b) => b.type === "text")
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

    // ─── 7. Собираем финальную структуру блоков ─────────────────────────────
    const resultBlocks = template.blocks.map((b) => {
      if (b.type === "text" && b.ai) {
        return {
          type: "text" as const,
          title: b.title,
          content: aiContents[b.id] || `<p><i>${b.description}</i></p>`,
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
      // placeholder
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
