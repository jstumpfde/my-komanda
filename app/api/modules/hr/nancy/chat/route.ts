// POST /api/modules/hr/nancy/chat
//
// AI-бэкенд Нэнси — голосового ассистента HR-платформы.
// Принимает сообщение + контекст страницы + историю диалога.
// Возвращает: { reply: string, actions?: NancyAction[] }
//
// Структурированные действия Нэнси передаются внутри <action>JSON</action> тегов:
//   fill_outbound  — заполнить форму исходящего поиска
//   search_outbound — запустить поиск
//   navigate        — перейти на страницу
//
// Модель: claude-haiku-4-5 (быстрый, дешёвый — для real-time голоса важно).

import { NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { requireCompany, apiError } from "@/lib/api-helpers"

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
  baseURL: process.env.CLAUDE_PROXY_URL ?? undefined,
})

export interface NancyAction {
  type: "fill_outbound" | "search_outbound" | "navigate"
  // fill_outbound
  textClauses?: Array<{ text: string; field: string }>
  area?: string
  experience?: string
  softCriteria?: string
  // navigate
  href?: string
}

export interface NancyChatRequest {
  message: string
  context?: {
    page?: string          // pathname, напр. "/hr/vacancies/abc/…"
    vacancyId?: string
    vacancyTitle?: string
  }
  history?: Array<{ role: "user" | "nancy"; text: string }>
}

const SYSTEM = `Ты — Нэнси, голосовой AI-ассистент HR-платформы Company24.
Говоришь по-русски. Стиль: дружелюбный, живой, лаконичный (1-3 фразы). Без «Конечно!», без занудства.

Твои задачи:
- Помочь найти кандидатов через «Исходящий подбор»: задать вопросы и заполнить форму поиска
- Ответить на вопросы о работе с платформой
- Помочь перейти в нужный раздел

Когда нужно заполнить форму исходящего поиска — верни действие внутри тегов <action>…</action>:
<action>{"type":"fill_outbound","textClauses":[{"text":"менеджер продаж","field":"TITLE"},{"text":"авиаперевозки","field":"EXPERIENCE"}],"area":"Москва","experience":"between3And6","softCriteria":"Опыт в B2B продажах промышленного оборудования"}</action>

Поля textClauses: field ∈ TITLE | SKILLS | EXPERIENCE | COMPANY_NAME | EVERYWHERE.
Поле experience: noExperience | between1And3 | between3And6 | moreThan6 — или не указывай если не важно.

Когда HR говорит «ищи», «начни поиск», «найди», «давай» — добавь:
<action>{"type":"search_outbound"}</action>

Когда нужен переход по платформе:
<action>{"type":"navigate","href":"/hr/vacancies"}</action>

Доступные разделы платформы: /hr/vacancies (вакансии), /hr/calendar (календарь), /hr/candidates (кандидаты), /hr/interviews (интервью), /team (команда), /settings (настройки).

ВАЖНО: теги <action> в ответном тексте не видны пользователю — выводи их только для машины. В речи описывай действие словами: «Хорошо, заполняю форму поиска» или «Открываю вакансии».`

export async function POST(req: Request) {
  let user
  try {
    user = await requireCompany()
  } catch (res) {
    return res as Response
  }
  void user

  let body: NancyChatRequest
  try {
    body = (await req.json()) as NancyChatRequest
  } catch {
    return apiError("Некорректное тело запроса", 400)
  }

  const message = body.message?.trim()
  if (!message || message.length < 1) return apiError("Сообщение пустое", 400)
  if (message.length > 2000) return apiError("Сообщение слишком длинное", 400)

  // Контекст страницы — добавляем к system prompt
  const pageCtx = [
    body.context?.page ? `Текущая страница: ${body.context.page}` : null,
    body.context?.vacancyTitle ? `Вакансия: «${body.context.vacancyTitle}»` : null,
    body.context?.vacancyId ? `ID вакансии: ${body.context.vacancyId}` : null,
  ].filter(Boolean).join("\n")

  const systemFull = pageCtx ? `${SYSTEM}\n\n${pageCtx}` : SYSTEM

  // История диалога → сообщения Claude
  const history = (body.history ?? []).slice(-10) // последние 10 реплик
  const messages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({
      role: m.role === "nancy" ? ("assistant" as const) : ("user" as const),
      content: m.text,
    })),
    { role: "user" as const, content: message },
  ]

  try {
    const resp = await client.messages.create({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system:     systemFull,
      messages,
    })

    const full = (resp.content[0] as { type: string; text?: string }).text ?? ""

    // Извлекаем действия из <action>…</action> тегов
    const actionMatches = [...full.matchAll(/<action>([\s\S]*?)<\/action>/g)]
    const actions: NancyAction[] = []
    for (const m of actionMatches) {
      try {
        actions.push(JSON.parse(m[1]) as NancyAction)
      } catch { /* невалидный JSON — пропускаем */ }
    }

    // Текст ответа — без action-тегов
    const reply = full.replace(/<action>[\s\S]*?<\/action>/g, "").trim()

    return NextResponse.json({ reply, actions: actions.length ? actions : undefined })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[nancy/chat]", msg)
    return apiError(`AI недоступен: ${msg.slice(0, 200)}`, 502)
  }
}
