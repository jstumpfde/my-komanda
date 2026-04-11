import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { knowledgeArticles } from "@/lib/db/schema"
import { apiError, apiSuccess, requireCompany } from "@/lib/api-helpers"
import { getClaudeMessagesUrl } from "@/lib/claude-proxy"

// POST /api/modules/knowledge/generate
// Генерирует документ по мастер-шаблону Ненси и сохраняет как черновик
// knowledge_article. Возвращает { ok, articleId, title }.

export type DocType =
  | "regulation"
  | "instruction"
  | "sales_script"
  | "onboarding"
  | "job_description"
  | "faq"
  | "article"
  | "test"
  | "privacy_policy"
  | "offer"
  | "cookie_policy"
  | "consent"
  | "user_agreement"

interface GenerateRequest {
  type: DocType
  topic: string
  department?: string
  audience?: string
  // Для документов «Для сайта» — реквизиты компании, подставляются в шаблон
  companyInn?: string
  contactEmail?: string
  siteDomain?: string
  // Если true → материал сохраняется с тегом "website" в дополнение к типу
  websiteDoc?: boolean
}

const CLAUDE_MODEL = "claude-sonnet-4-20250514"

// ─── Мастер-шаблоны (копия из SYSTEM_PROMPT Ненси) ──────────────────────────

const DOC_TEMPLATES: Record<DocType, { label: string; prompt: string }> = {
  regulation: {
    label: "Регламент",
    prompt: `Создай регламент по теме. Строго следуй структуре:
1. Цель регламента
2. Область применения (кто, когда, где)
3. Термины и определения (если нужны)
4. Порядок действий (пронумерованные шаги)
5. Ответственные лица и роли
6. Контроль исполнения и санкции
7. Приложения (чек-листы, формы) — перечислить что нужно`,
  },
  instruction: {
    label: "Инструкция / SOP",
    prompt: `Создай инструкцию (SOP). Строго следуй структуре:
1. Назначение инструкции
2. Необходимые ресурсы (оборудование, доступы, материалы)
3. Подготовка (что проверить до начала)
4. Пошаговое выполнение (шаг → действие → результат)
5. Проверка результата
6. Частые ошибки и как их избежать
7. Контакты для помощи`,
  },
  sales_script: {
    label: "Скрипт продаж",
    prompt: `Создай скрипт продаж / звонка. Строго следуй структуре:
1. Цель звонка и целевой результат
2. Приветствие (2-3 варианта)
3. Квалификация клиента (3-5 вопросов)
4. Презентация ценности (не продукта — выгоды клиента)
5. Работа с возражениями (топ-5 возражений + ответы)
6. Закрытие сделки (2-3 техники)
7. Фоллоу-ап (что делать после звонка)`,
  },
  onboarding: {
    label: "Онбординг",
    prompt: `Создай план онбординга. Строго следуй структуре:
1. До выхода (подготовка рабочего места, доступы, приветственное письмо)
2. День 1 (встреча, экскурсия, знакомство с командой, документы)
3. Неделя 1 (обучение продукту, процессам, инструментам)
4. Месяц 1 (первые задачи, наставник, промежуточная обратная связь)
5. Месяц 2-3 (самостоятельная работа, KPI, аттестация)
6. Чек-лист наставника (что проверить на каждом этапе)
7. Красные флаги (когда бить тревогу)`,
  },
  job_description: {
    label: "Должностная инструкция",
    prompt: `Создай должностную инструкцию. Строго следуй структуре:
1. Общие положения (название, подчинение, замещение)
2. Квалификационные требования (образование, опыт, навыки)
3. Должностные обязанности (пронумерованный список)
4. Права сотрудника
5. Ответственность
6. Взаимодействие (с кем и по каким вопросам)
7. KPI и критерии оценки`,
  },
  faq: {
    label: "FAQ",
    prompt: `Создай FAQ. Строго следуй структуре:
- Группировка по темам (3-5 групп)
- В каждой группе: 3-7 пар «Вопрос → Ответ»
- Ответы: 1-3 предложения, конкретно, без воды
- В конце: «Не нашли ответ? Обратитесь к [контакт]»`,
  },
  article: {
    label: "Статья / обучающий материал",
    prompt: `Создай обучающую статью. Строго следуй структуре:
1. Введение (зачем это знать + что получит читатель)
2. Основная часть (разбитая на 3-7 секций с подзаголовками)
3. Примеры из практики (1-2 кейса)
4. Ключевые выводы (3-5 пунктов)
5. Что делать дальше (следующие шаги / связанные материалы)`,
  },
  test: {
    label: "Аттестация / тест",
    prompt: `Создай тест для аттестации. Строго следуй структуре:
- Вопросы с 4 вариантами ответа (один правильный отмечен ✓)
- Микс типов: знание фактов, понимание процессов, применение на практике
- Уровни сложности: 40% лёгкие, 40% средние, 20% сложные
- 10 вопросов по умолчанию если не указано иначе`,
  },
  privacy_policy: {
    label: "Политика конфиденциальности",
    prompt: `Создай политику конфиденциальности по ФЗ-152. Строго следуй структуре:
1. Общие положения
2. Цели обработки персональных данных
3. Перечень обрабатываемых данных
4. Правовые основания обработки
5. Порядок сбора, хранения и защиты
6. Права субъектов персональных данных
7. Файлы cookie и аналитика
8. Контактная информация оператора

⚠️ В конец добавь дисклеймер: «Документ сгенерирован AI. Рекомендуем проверку юристом перед публикацией.»`,
  },
  offer: {
    label: "Оферта",
    prompt: `Создай публичную оферту. Строго следуй структуре:
1. Предмет оферты
2. Термины и определения
3. Порядок заключения договора
4. Стоимость и порядок оплаты
5. Доставка / оказание услуг
6. Возврат и рекламации
7. Ответственность сторон
8. Персональные данные
9. Прочие условия
10. Реквизиты

⚠️ В конец добавь дисклеймер: «Документ сгенерирован AI. Рекомендуем проверку юристом перед публикацией.»`,
  },
  cookie_policy: {
    label: "Cookie-политика",
    prompt: `Создай cookie-политику. Строго следуй структуре:
1. Что такое cookie
2. Какие cookie мы используем (необходимые, аналитические, маркетинговые)
3. Сторонние cookie (Google Analytics, Яндекс.Метрика и т.д.)
4. Управление cookie (как отключить)
5. Контакты

⚠️ В конец добавь дисклеймер: «Документ сгенерирован AI. Рекомендуем проверку юристом перед публикацией.»`,
  },
  consent: {
    label: "Согласие на обработку ПД",
    prompt: `Создай форму согласия на обработку персональных данных по ФЗ-152. Структура:
1. Субъект персональных данных (ФИО, паспортные данные, место прописки)
2. Оператор (наименование компании, ИНН, юридический адрес, контакты)
3. Перечень персональных данных, обрабатываемых с согласия
4. Цели обработки (конкретный перечень)
5. Перечень действий с персональными данными (сбор, хранение, передача и т.п.)
6. Срок действия согласия и условия его отзыва
7. Способ отзыва согласия (письмо на email/почтовый адрес)
8. Подпись и дата

⚠️ В конец добавь дисклеймер: «Документ сгенерирован AI. Рекомендуем проверку юристом перед публикацией.»`,
  },
  user_agreement: {
    label: "Пользовательское соглашение",
    prompt: `Создай пользовательское соглашение для сайта / сервиса. Структура:
1. Термины и определения
2. Предмет соглашения
3. Права и обязанности сторон
4. Условия использования сервиса (правила, запреты)
5. Ответственность сторон
6. Интеллектуальная собственность
7. Изменение условий соглашения
8. Порядок разрешения споров
9. Реквизиты и контакты оператора

⚠️ В конец добавь дисклеймер: «Документ сгенерирован AI. Рекомендуем проверку юристом перед публикацией.»`,
  },
}

const BASE_SYSTEM =
  "Ты — Ненси, AI-ассистент корпоративной базы знаний Company24.pro. " +
  "Ты создаёшь корпоративные документы на русском языке, в профессиональном тоне, " +
  "строго по шаблону. Используй Markdown: заголовки (# / ##), списки, жирный для ключевых терминов. " +
  "Ответ должен быть сразу готовым документом без вводных фраз типа «вот ваш документ:»."

function slugify(input: string): string {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo",
    ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m",
    н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u",
    ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch",
    ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  }
  return input
    .toLowerCase()
    .split("")
    .map((c) => map[c] ?? (c.match(/[a-z0-9]/) ? c : "-"))
    .join("")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)
}

function extractTitle(markdown: string, fallback: string): string {
  const h1 = markdown.match(/^#\s+(.+)/m)
  if (h1) return h1[1].trim().slice(0, 200)
  const h2 = markdown.match(/^##\s+(.+)/m)
  if (h2) return h2[1].trim().slice(0, 200)
  const firstLine = markdown.split("\n").find((l) => l.trim().length > 5)?.trim()
  return (firstLine ?? fallback).slice(0, 200)
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = (await req.json()) as Partial<GenerateRequest>

    const type = body.type
    const topic = body.topic?.trim()

    if (!type || !(type in DOC_TEMPLATES)) {
      return apiError("Неизвестный тип документа", 400)
    }
    if (!topic) {
      return apiError("Укажите тему документа", 400)
    }

    const template = DOC_TEMPLATES[type]
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return apiError("ANTHROPIC_API_KEY не настроен", 503)
    }

    // ── Call Claude ──────────────────────────────────────────────────────
    const contextBits: string[] = [`Тема: ${topic}`]
    if (body.department) contextBits.push(`Отдел: ${body.department}`)
    if (body.audience) contextBits.push(`Целевая аудитория: ${body.audience}`)
    if (body.companyInn) contextBits.push(`ИНН компании: ${body.companyInn}`)
    if (body.contactEmail) contextBits.push(`Email для обращений: ${body.contactEmail}`)
    if (body.siteDomain) contextBits.push(`Домен сайта: ${body.siteDomain}`)

    const userMessage = `${template.prompt}\n\n${contextBits.join("\n")}`

    const claudeRes = await fetch(getClaudeMessagesUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 4096,
        system: BASE_SYSTEM,
        messages: [{ role: "user", content: userMessage }],
      }),
    })

    if (!claudeRes.ok) {
      const errText = await claudeRes.text().catch(() => "")
      console.error("[knowledge/generate] Claude error", claudeRes.status, errText)
      return apiError(`Claude API вернул ${claudeRes.status}`, 502)
    }

    const data = (await claudeRes.json()) as {
      content?: { type: string; text?: string }[]
    }
    const content = data.content?.find((c) => c.type === "text")?.text?.trim() ?? ""
    if (!content) {
      return apiError("Пустой ответ от Claude", 502)
    }

    // ── Save as draft article ────────────────────────────────────────────
    const title = extractTitle(content, `${template.label}: ${topic}`)
    const excerpt = content.replace(/[#*`>_-]/g, "").trim().slice(0, 300)

    // Для документов «Для сайта» — тег website в дополнение к типу.
    // Авто-детект по type если websiteDoc явно не передан.
    const WEBSITE_TYPES = new Set<DocType>([
      "privacy_policy",
      "offer",
      "cookie_policy",
      "consent",
      "user_agreement",
    ])
    const isWebsiteDoc = body.websiteDoc === true || WEBSITE_TYPES.has(type)
    const tags = isWebsiteDoc ? [type, "website"] : [type]

    const [article] = await db
      .insert(knowledgeArticles)
      .values({
        tenantId: user.companyId,
        title,
        slug: slugify(title),
        content,
        excerpt,
        authorId: user.id,
        status: "draft",
        audience: body.audience ? [body.audience] : ["employees"],
        tags,
        reviewCycle: "none",
      })
      .returning({ id: knowledgeArticles.id, title: knowledgeArticles.title })

    return apiSuccess({ ok: true, articleId: article.id, title: article.title })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[knowledge/generate]", err)
    return apiError("Internal server error", 500)
  }
}
