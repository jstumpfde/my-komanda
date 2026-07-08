// #15-phase3: генератор системного промпта для AI-агента.
// Один вызов Claude Sonnet с meta-prompt'ом, который собирает контекст
// вакансии и компании. Результат сохраняется в vacancies.ai_chatbot_prompt.
//
// Escape clause: если нет companies.description — используем только title +
// salary + city/format. Это минимальный safe вариант.

import { NextRequest, NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies, companies } from "@/lib/db/schema"
import { requireCompany } from "@/lib/api-helpers"
import { callClaudeSonnet } from "@/lib/ai/client"
import { getSpec } from "@/lib/core/spec/store"
import { mustHaveTexts, niceToHaveTexts, dealBreakerTexts } from "@/lib/core/spec/types"

interface Triggers {
  salary?: boolean; schedule?: boolean; location?: boolean; requirements?: boolean
  callRequest?: boolean; demoCheckIn?: boolean; interviewScheduling?: boolean
}

const TRIGGER_LABEL: Record<keyof Triggers, string> = {
  salary:              "вопросы о зарплате",
  schedule:            "вопросы о графике работы",
  location:            "вопросы о локации",
  requirements:        "вопросы о требованиях к опыту",
  callRequest:         "просьбы о звонке (перенаправлять на демо)",
  demoCheckIn:         "вопросы «удалось посмотреть демо?»",
  interviewScheduling: "согласование времени интервью",
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompany()
    const { id } = await ctx.params
    const body = await req.json().catch(() => ({})) as { triggers?: Triggers }
    const triggers = body.triggers ?? {}
    const enabledTriggers = (Object.keys(TRIGGER_LABEL) as (keyof Triggers)[])
      .filter(k => triggers[k])
      .map(k => TRIGGER_LABEL[k])
    if (enabledTriggers.length === 0) {
      return NextResponse.json({ error: "no triggers selected" }, { status: 400 })
    }

    // Тащим данные вакансии + компании (один JOIN).
    const [row] = await db
      .select({
        vacancyTitle: vacancies.title,
        salaryMin:    vacancies.salaryMin,
        salaryMax:    vacancies.salaryMax,
        city:         vacancies.city,
        format:       vacancies.format,
        descJson:     vacancies.descriptionJson,
        companyName:  companies.name,
      })
      .from(vacancies)
      .leftJoin(companies, eq(companies.id, vacancies.companyId))
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)
    if (!row) return NextResponse.json({ error: "vacancy not found" }, { status: 404 })

    const anketa = (row.descJson && typeof row.descJson === "object")
      ? (row.descJson as Record<string, unknown>).anketa as Record<string, unknown> | undefined
      : undefined

    const facts: string[] = []
    facts.push(`Должность: ${row.vacancyTitle ?? "—"}`)
    if (row.salaryMin || row.salaryMax) {
      facts.push(`Зарплата: ${row.salaryMin ?? "?"} — ${row.salaryMax ?? "?"} ₽`)
    }
    if (row.city)   facts.push(`Город: ${row.city}`)
    if (row.format) facts.push(`Формат: ${row.format}`)
    if (anketa) {
      const r = anketa.responsibilities; if (typeof r === "string" && r.trim()) facts.push(`Обязанности: ${r.trim().slice(0, 500)}`)
      const q = anketa.requirements;     if (typeof q === "string" && q.trim()) facts.push(`Требования: ${q.trim().slice(0, 500)}`)
    }

    // Портрет «Кого ищем» (lib/core/spec) — если заполнен, даём боту те же
    // факты, что использует AI-скоринг резюме, чтобы бот не придумывал
    // требования от себя и не противоречил тому, по чему реально отбираем.
    try {
      const spec = await getSpec(id)
      if (spec) {
        const must = mustHaveTexts(spec.mustHave).slice(0, 10)
        const nice = niceToHaveTexts(spec.niceToHave).slice(0, 10)
        const deal = dealBreakerTexts(spec.dealBreakers).slice(0, 10)
        if (must.length) facts.push(`Обязательные требования (Портрет): ${must.join("; ").slice(0, 800)}`)
        if (nice.length) facts.push(`Желательные плюсы (Портрет): ${nice.join("; ").slice(0, 800)}`)
        if (deal.length) facts.push(`Стоп-факторы, при которых кандидату откажут (Портрет): ${deal.join("; ").slice(0, 800)}`)
      }
    } catch {
      // Портрет не заполнен/недоступен — не критично, генератор работает и без него.
    }

    const meta = `Ты — генератор промптов для AI-агента, общающегося с кандидатами на вакансию.

Создай system prompt для агента на русском, который должен:
1. Представляться как «HR-бот компании ${row.companyName ?? "нашей компании"}».
2. Отвечать на вопросы кандидатов вежливо и кратко (1-3 предложения).
3. Использовать факты вакансии:
${facts.map(f => "   • " + f).join("\n")}
4. Темы, на которые отвечать: ${enabledTriggers.join(", ")}.
5. На вопросы вне этих тем — отправлять кандидата заполнить демо или говорить «уточню у HR и вернусь».
6. НИКОГДА не делать обещаний по зарплате выше указанной.
7. НИКОГДА не подтверждать интервью без HR${triggers.interviewScheduling ? "" : " (согласование времени отключено)"}.
8. Если кандидат раздражён — извиниться и предложить связь с HR.
9. ОБЯЗАТЕЛЬНО включи в промпт следующий блок про честность (его нельзя пропустить):
   «Если кандидат спрашивает «Ты AI?», «Ты бот?», «Ты ИИ?», «Это автоответ?» — честно отвечай:
   "Я виртуальный ассистент компании на основе AI. Я помогаю менеджерам с предварительным отбором, а также вам пройти первые этапы воронки. По всем вопросам которые я не могу решить, я сообщаю нашему HR."»

Верни ТОЛЬКО system prompt без объяснений, без markdown-обёрток, без префиксов вроде "Вот промпт:".`

    const prompt = (await callClaudeSonnet(meta, undefined, 2000)).trim()
    if (!prompt) return NextResponse.json({ error: "empty AI response" }, { status: 502 })

    await db.update(vacancies)
      .set({ aiChatbotPrompt: prompt, updatedAt: new Date() })
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))

    return NextResponse.json({ prompt })
  } catch (e) {
    if (e instanceof Response) return e
    const msg = e instanceof Error ? e.message : "internal"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
