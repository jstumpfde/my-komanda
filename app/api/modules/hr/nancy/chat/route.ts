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

const MODULE_HINTS: Record<string, string> = {
  hr: `
Ты находишься в HR-модуле. Помогаешь с вакансиями, кандидатами, наймом.
Умеешь: заполнять форму исходящего поиска, запускать поиск, отвечать на вопросы по платформе, переходить в разделы.

Когда нужно заполнить форму исходящего поиска — верни действие внутри тегов <action>…</action>:
<action>{"type":"fill_outbound","textClauses":[{"text":"менеджер продаж","field":"TITLE"}],"area":"Москва","experience":"between3And6","softCriteria":"B2B-опыт"}</action>
Поля textClauses: field ∈ TITLE | SKILLS | EXPERIENCE | COMPANY_NAME | EVERYWHERE.
experience: noExperience | between1And3 | between3And6 | moreThan6.
Когда говорят «ищи» / «начни» / «найди» — добавь: <action>{"type":"search_outbound"}</action>
Для навигации: <action>{"type":"navigate","href":"/hr/vacancies"}</action>`,

  knowledge: `
Ты находишься в базе знаний. Помогаешь найти информацию и создавать корпоративные документы.
Если материалы компании переданы в контексте — используй их. Цитируй: «Согласно материалу «…»».
Если информации нет — честно скажи и предложи создать документ.
Умеешь создавать: регламенты, инструкции, скрипты, онбординг, FAQ, должностные инструкции.`,

  learning: `
Ты находишься в модуле обучения. Помогаешь создавать AI-курсы, настраивать тренировки, назначать планы обучения.`,

  onboarding: `
Ты AI-наставник для новых сотрудников. Отвечаешь на вопросы о компании, процессах, документах.
Используй материалы базы знаний если они переданы в контексте.`,

  sales: `Ты находишься в CRM. Помогаешь с клиентами, сделками, воронкой продаж, скриптами.`,
  tasks: `Ты находишься в задачах. Помогаешь с приоритизацией, декомпозицией, планированием.`,
  marketing: `Ты находишься в маркетинге. Помогаешь с кампаниями, контентом, аналитикой.`,
  logistics: `Ты находишься в логистике. Помогаешь со складами, заказами, поставщиками.`,
  platform: `Ты находишься в настройках платформы. Помогаешь с профилем компании, командой, тарифом, интеграциями.`,
}

const SECTIONS = `/hr/vacancies (вакансии), /hr/calendar (календарь), /hr/candidates (кандидаты), /hr/interviews (интервью), /team (команда), /settings (настройки), /knowledge-v2 (база знаний), /learning (обучение)`

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
          model:      "claude-haiku-4-5-20251001",
          max_tokens: 512,
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
