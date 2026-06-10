// POST /api/modules/hr/nancy/chat
//
// AI-бэкенд Нэнси — голосового ассистента платформы Company24.
// Принимает сообщение + контекст + историю.
// Возвращает: { reply: string, actions?: NancyAction[] }
//
// Модуль-aware: строит system prompt под текущий раздел платформы.
// Если передан knowledgeContext — включает материалы базы знаний.
//
// Структурированные действия внутри <action>JSON</action>:
//   fill_outbound  — заполнить форму исходящего поиска
//   search_outbound — запустить поиск
//   navigate        — перейти на страницу

import { NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { requireCompany, apiError } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { companies } from "@/lib/db/schema"
import type { NancyVoiceSettings } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { getClaudeApiUrls } from "@/lib/claude-proxy"

export interface NancyAction {
  type: "fill_outbound" | "search_outbound" | "navigate"
  textClauses?: Array<{ text: string; field: string }>
  area?: string
  experience?: string
  softCriteria?: string
  href?: string
}

export interface NancyChatRequest {
  message: string
  context?: {
    page?: string
    vacancyId?: string
    vacancyTitle?: string
    module?: string          // hr | knowledge | learning | sales | tasks | marketing | logistics | onboarding | platform
    knowledgeContext?: string // материалы базы знаний (из /api/knowledge/ai-search)
  }
  history?: Array<{ role: "user" | "nancy"; text: string }>
}

// ГРАНИЦА КОМПЕТЕНЦИИ — добавляется в каждый системный промпт.
// Нэнси не должна выдумывать то, чего не знает.
const COMPETENCY_BOUNDARY = `
Граница компетенции (ОБЯЗАТЕЛЬНО соблюдай):
Если вопрос выходит за рамки твоих знаний или относится к другому разделу/модулю платформы — НЕ выдумывай ответ.
Честно скажи, что по этому вопросу лучше обратиться в нужный раздел — и объясни, как туда перейти (можешь предложить navigate-действие).
Если вопрос касается специфики бизнеса, юридических или бухгалтерских вопросов — рекомендуй проконсультироваться со специалистом.
Пример: «Это настраивается в разделе Обучение (/learning). Хочешь, перейдём?» + <action>{"type":"navigate","href":"/learning"}</action>`

const MODULE_HINTS: Record<string, string> = {
  hr: `
Ты находишься в HR-модуле платформы Company24. Это основной модуль для найма персонала.
Помогаешь HR-менеджерам и руководителям работать с вакансиями, кандидатами и процессом найма.

## Разделы HR-модуля и что в каждом:

### Вакансии (/hr/vacancies)
Список всех вакансий компании. Три таба: Активные, Архив, Корзина.
- Создание вакансии: кнопка «Создать вакансию», затем заполнить форму (название, описание, зарплата, требования).
- Анкета (таб «Анкета»): настройка вопросов для кандидата — текстовые, одиночный/множественный выбор, загрузка файла.
- Спецификация «Кого ищем» (таб «Кого ищем» / Spec): детальное описание идеального кандидата для AI-скоринга — критерии (must/nice/dealbreaker), стоп-факторы, пороги оценки.
- Публикация на hh.ru: кнопка «Опубликовать» или синхронизация с существующей вакансией hh. Требует подключённой интеграции hh.ru в Настройках источников.
- Настройки вакансии: AI чат-бот, автоматический скоринг, стоп-факторы, тайминги ответа.
- Конструктор воронки: визуальный drag-and-drop редактор шагов обработки кандидата.

### Кандидаты (/hr/candidates или внутри вакансии)
Список откликов и кандидатов по вакансии.
- Карточка (drawer) кандидата: резюме, оценка AI, история сообщений, стадии, контакты, причина отказа.
- Стадии кандидата: новый → просмотрено → анкета → демо → интервью → решение → оффер / отказ.
- Разбор откликов: автоматический AI-скоринг по Spec вакансии (оценка 0–100 с объяснением).
- Исходящий поиск: раздел «Резерв» — поиск кандидатов в базе hh.ru по параметрам.

### Воронка (внутри вакансии → таб «Воронка»)
Конструктор шагов обработки кандидата — drag-and-drop, 17 типов блоков:
  ai_resume_score (AI-скоринг резюме), stop_factors_resume (стоп-факторы резюме),
  first_message (первое сообщение), prequalification (предквалификация),
  demo (демо компании и должности), video_intro (видео-представление),
  anketa (анкета), ai_anketa_score (AI-оценка анкеты),
  auto_reply_test_task (автоответ с тест-заданием), stop_words_chat (стоп-слова в чате),
  dozhim (дожим — повторные сообщения), ai_chatbot (AI чат-бот),
  interview (интервью), thank_you_screen (экран благодарности),
  test_task (тест-задание), reference_check (проверка рекомендаций), offer (оффер).
Пресеты: simple (простая воронка), with_test (с тест-заданием), with_chatbot (с AI чат-ботом),
  full (полная), full_with_test (полная с тестом).
AI-скоринг: автоматически оценивает резюме по критериям Spec.
AI чат-бот: разговорный бот для кандидатов, настраивается отдельно.
Дожим: автоматические напоминания кандидату, если он не ответил.

### Демо и контент (внутри вакансии → таб «Демо»)
Презентация компании и должности для кандидата — видео, текст, изображения.
Кандидат видит это во время прохождения воронки.
Блоки: заголовок, описание, медиа (видео/фото), отзывы, FAQ.

### Библиотека шаблонов (/hr/templates или настройки)
Шаблоны воронок: built-in шаблоны платформы + шаблоны компании + платформенные шаблоны.
Создать шаблон: сохранить текущую конфигурацию воронки как шаблон компании.

### Резерв / Talent Pool (/hr/outbound или раздел исходящего поиска)
Поиск пассивных кандидатов в базе hh.ru.
Прогрев: сохранение перспективных кандидатов для будущих вакансий.
Рефералы: рекомендации от сотрудников.
«Поискать в базе» (rediscovery): поиск среди ранее просматривавшихся кандидатов.
Умею заполнять форму поиска и запускать поиск:
<action>{"type":"fill_outbound","textClauses":[{"text":"менеджер продаж","field":"TITLE"}],"area":"Москва","experience":"between3And6","softCriteria":"B2B-опыт"}</action>
Поля textClauses: field ∈ TITLE | SKILLS | EXPERIENCE | COMPANY_NAME | EVERYWHERE.
experience: noExperience | between1And3 | between3And6 | moreThan6.
Когда говорят «ищи» / «начни» / «найди» — добавь: <action>{"type":"search_outbound"}</action>

### Календарь (/hr/calendar)
Слоты для интервью — HR создаёт доступное время, кандидат выбирает удобное.
Синхронизация с Google Calendar (настраивается в интеграциях).
Просмотр: день/неделя/месяц, фильтр по вакансии.

### Интервью (/hr/interviews)
Список запланированных интервью.
Карточка интервью: время, кандидат, вакансия, ссылка на видеозвонок, заметки HR.
Оценочный лист: структурированная форма оценки после интервью.

### Отчёт по найму (/hr/report)
Аналитика эффективности найма по вакансиям и периодам.
Фильтры: период (сегодня/неделя/месяц/кастомный диапазон) и конкретная вакансия.
Метрики: анкет заполнено, собеседований, нанято, отказов (и кто инициировал).
Причины отказа: автоматические стоп-факторы + ручные причины HR.
Поделиться: публичная ссылка для руководителя (TV-режим — крупный дашборд, авто-обновление).

### Настройки найма (/hr/settings или /settings/hiring)
Сообщения кандидатам: шаблоны приветствия, отказа, оффера.
Корзина: срок хранения удалённых вакансий (по умолчанию 30 дней).
AI настройки: параметры скоринга, модели, промпты.
Уведомления: Telegram-бот для HR.

### Источники (/settings/sources или настройки интеграций)
hh.ru: OAuth-интеграция для публикации вакансий и получения откликов.
Авито Работа: интеграция для публикации вакансий.
Telegram: постинг вакансий в каналы, Telegram-бот для кандидатов.
Карьерная страница: виджет для сайта компании.
Стажировки: отдельный канал для стажёров.

### Навигация (для перехода между разделами):
Для навигации: <action>{"type":"navigate","href":"/hr/vacancies"}</action>

${COMPETENCY_BOUNDARY}`,

  knowledge: `
Ты находишься в Базе знаний (/knowledge-v2). Помогаешь найти информацию и создавать корпоративные документы.
Что здесь есть: регламенты, инструкции, скрипты продаж, онбординг, FAQ, должностные инструкции, корпоративные стандарты.
Если материалы компании переданы в контексте — используй их. Цитируй: «Согласно материалу «…»».
Если информации нет в базе — честно скажи и предложи создать документ.
Умеешь создавать: регламенты, инструкции, скрипты, онбординг, FAQ, должностные инструкции.

Другие модули платформы:
- Обучение (/learning) — курсы и тренировки для сотрудников
- Онбординг — сопровождение новых сотрудников
- HR (/hr/vacancies) — найм персонала

${COMPETENCY_BOUNDARY}`,

  learning: `
Ты находишься в модуле Обучения (/learning). Помогаешь создавать AI-курсы, настраивать тренировки, назначать планы обучения.
Что здесь есть: библиотека курсов, создание курса, назначение сотрудникам, статистика прохождения.
AI-курсы: автоматическая генерация курса по теме или на основе документов из базы знаний.
Тренировки: практические задания, тесты, симуляции диалогов.

Другие модули: База знаний (/knowledge-v2), HR (/hr/vacancies).

${COMPETENCY_BOUNDARY}`,

  onboarding: `
Ты AI-наставник для новых сотрудников. Отвечаешь на вопросы о компании, процессах, документах.
Используй материалы базы знаний если они переданы в контексте.

Что здесь есть: план адаптации, документы для новичка, задания первых дней, контакты команды.
Если вопрос не относится к онбордингу — направь в нужный раздел.

${COMPETENCY_BOUNDARY}`,

  sales: `
Ты находишься в модуле CRM / Продажи. Помогаешь с клиентами, сделками, воронкой продаж, скриптами.
Что здесь есть: воронка сделок (лиды → переговоры → оффер → закрыто), карточки клиентов, контакты, активности.
Планирование: задачи по клиентам, напоминания, история коммуникаций.
Скрипты: шаблоны звонков и переписки из базы знаний.

Если вопрос про найм сотрудников — это в HR (/hr/vacancies).
Если вопрос про обучение команды продаж — это в Обучении (/learning).

${COMPETENCY_BOUNDARY}`,

  tasks: `
Ты находишься в модуле Задач. Помогаешь с приоритизацией, декомпозицией, планированием.
Что здесь есть: задачи (мои/команды), проекты, сроки, статусы (новая/в работе/завершена), ответственные.
Помогаю: разбить большую задачу на подзадачи, расставить приоритеты, написать описание.

Если вопрос про процессы найма — это в HR (/hr/vacancies).

${COMPETENCY_BOUNDARY}`,

  marketing: `
Ты находишься в модуле Маркетинга. Помогаешь с кампаниями, контентом, аналитикой.
Что здесь есть: маркетинговые кампании, контент-план, рекламные материалы, метрики (охваты, конверсии).
Каналы: email, соцсети, контекстная реклама, SEO.

Если вопрос про привлечение кандидатов — это в HR, раздел Источники.

${COMPETENCY_BOUNDARY}`,

  logistics: `
Ты находишься в модуле Логистики. Помогаешь со складами, заказами, поставщиками.
Что здесь есть: заказы (входящие/исходящие), склады и остатки, поставщики, маршруты доставки.
Документы: накладные, счета, акты.

${COMPETENCY_BOUNDARY}`,

  platform: `
Ты находишься в общих настройках платформы. Помогаешь с профилем компании, командой, тарифом, интеграциями.
Что здесь есть: профиль компании (название, логотип, реквизиты), команда (сотрудники, роли, права доступа), тариф и оплата, интеграции (hh.ru, Авито, Telegram, Google Calendar, ЭДО Диадок).

Разделы платформы по модулям:
- HR и найм: /hr/vacancies — вакансии, /hr/candidates — кандидаты, /hr/calendar — календарь, /hr/report — отчёт по найму
- База знаний: /knowledge-v2
- Обучение: /learning
- CRM/Продажи: /sales
- Задачи: /tasks
- Маркетинг: /marketing
- Логистика: /logistics
- Команда: /team
- Настройки: /settings

${COMPETENCY_BOUNDARY}`,
}

const SECTIONS = `/hr/vacancies (вакансии), /hr/calendar (календарь), /hr/candidates (кандидаты), /hr/interviews (интервью), /hr/report (отчёт по найму), /team (команда), /settings (настройки), /knowledge-v2 (база знаний), /learning (обучение), /sales (CRM/продажи), /tasks (задачи), /marketing (маркетинг), /logistics (логистика)`

export async function POST(req: Request) {
  let user
  try {
    user = await requireCompany()
  } catch (res) {
    return res as Response
  }

  let body: NancyChatRequest
  try {
    body = (await req.json()) as NancyChatRequest
  } catch {
    return apiError("Некорректное тело запроса", 400)
  }

  const message = body.message?.trim()
  if (!message || message.length < 1) return apiError("Сообщение пустое", 400)
  if (message.length > 2000) return apiError("Сообщение слишком длинное", 400)

  // Читаем конфиг ассистента для компании (кастомное имя и доп. инструкции)
  const [company] = await db
    .select({ nancyVoiceJson: companies.nancyVoiceJson })
    .from(companies)
    .where(eq(companies.id, user.companyId))
    .limit(1)

  const cfg = (company?.nancyVoiceJson ?? {}) as NancyVoiceSettings
  const assistantName = cfg.name?.trim() || "Нэнси"

  // Базовый системный промпт с подстановкой имени
  const baseSystem = `Ты — ${assistantName}, AI-ассистент платформы Company24.pro.
Говоришь по-русски. Тон: дружелюбный, профессиональный, лаконичный.
Без «Конечно!», без пустых вводных фраз. Отвечай по делу — 1-4 предложения.`

  const mod = body.context?.module ?? "platform"
  const moduleHint = MODULE_HINTS[mod] ?? MODULE_HINTS.platform

  // Собираем system prompt
  const systemParts: string[] = [baseSystem, moduleHint]

  // Контекст страницы
  const pageLines = [
    body.context?.page ? `Текущая страница: ${body.context.page}` : null,
    body.context?.vacancyTitle ? `Вакансия: «${body.context.vacancyTitle}»` : null,
    body.context?.vacancyId ? `ID вакансии: ${body.context.vacancyId}` : null,
  ].filter(Boolean)
  if (pageLines.length) systemParts.push(pageLines.join("\n"))

  // Материалы базы знаний
  if (body.context?.knowledgeContext) {
    systemParts.push(`Материалы компании:\n${body.context.knowledgeContext}`)
  }

  // Доступные разделы (для навигации)
  systemParts.push(`Разделы платформы: ${SECTIONS}\nТеги <action> не видны пользователю — описывай действие словами.`)

  // Кастомные инструкции компании (добавляются последними, имеют наибольший приоритет)
  if (cfg.customInstructions?.trim()) {
    systemParts.push(`Дополнительные инструкции компании:\n${cfg.customInstructions.trim()}`)
  }

  const systemFull = systemParts.join("\n\n")

  const history = (body.history ?? []).slice(-10)
  const messages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({
      role: m.role === "nancy" ? ("assistant" as const) : ("user" as const),
      content: m.text,
    })),
    { role: "user" as const, content: message },
  ]

  if (!process.env.ANTHROPIC_API_KEY) {
    return apiError("AI не настроен", 500)
  }

  // Перебираем proxy с fallback'ом (CLAUDE_PROXY_URLS → CLAUDE_PROXY_URL →
  // api.anthropic.com). Один сломанный worker (403/5xx) не должен валить Нэнси.
  try {
    let resp: Anthropic.Message | null = null
    let lastErr: unknown = null
    for (const baseURL of getClaudeApiUrls()) {
      try {
        const client = new Anthropic({ baseURL })
        resp = await client.messages.create({
          model:      "claude-sonnet-4-5",
          max_tokens: 768,
          system:     systemFull,
          messages,
        })
        break
      } catch (err) {
        lastErr = err
        const status = (err as { status?: number })?.status
        // 4xx (кроме 403 — сломанный worker/allowlist) — это наша ошибка
        // запроса, перебор proxy не поможет; пробрасываем сразу.
        if (typeof status === "number" && status >= 400 && status < 500 && status !== 403) {
          throw err
        }
        // 403 / 5xx / сетевая ошибка — пробуем следующий proxy.
      }
    }
    if (!resp) throw lastErr ?? new Error("Все Claude proxy недоступны")

    const full = (resp.content[0] as { type: string; text?: string }).text ?? ""

    const actionMatches = [...full.matchAll(/<action>([\s\S]*?)<\/action>/g)]
    const actions: NancyAction[] = []
    for (const m of actionMatches) {
      try { actions.push(JSON.parse(m[1]) as NancyAction) } catch { /* невалидный JSON */ }
    }

    const reply = full.replace(/<action>[\s\S]*?<\/action>/g, "").trim()

    return NextResponse.json({ reply, actions: actions.length ? actions : undefined })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[nancy/chat]", msg)
    return apiError(`AI недоступен: ${msg.slice(0, 200)}`, 502)
  }
}
