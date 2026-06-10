// POST /api/modules/hr/nancy/feedback
//
// Фидбек по ответам Нэнси — основа самообучения.
// Собирает 👍/👎 с привязкой к вопросу, ответу, модулю и странице.
// Накопленные 👎 («не знаю», «не то») анализируются вручную/автоматически
// для пополнения customInstructions и базы знаний Нэнси.
//
// Следующий шаг: периодический дайджест частых «не знаю» → дополнение
// customInstructions компании или платформенной базы знаний Нэнси.

import { NextResponse } from "next/server"
import { requireCompany, apiError } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { nancyFeedback } from "@/lib/db/schema"

export interface NancyFeedbackRequest {
  messageId?: string        // опциональный client-side ID сообщения
  rating:     "up" | "down"
  question:   string        // текст вопроса пользователя
  answer:     string        // текст ответа Нэнси
  module?:    string        // hr | knowledge | learning | sales | ...
  page?:      string        // текущая страница (например /hr/vacancies)
}

export async function POST(req: Request) {
  let user
  try {
    user = await requireCompany()
  } catch (res) {
    return res as Response
  }

  let body: NancyFeedbackRequest
  try {
    body = (await req.json()) as NancyFeedbackRequest
  } catch {
    return apiError("Некорректное тело запроса", 400)
  }

  if (!body.rating || !["up", "down"].includes(body.rating)) {
    return apiError("Поле rating должно быть 'up' или 'down'", 400)
  }

  const question = body.question?.trim() ?? ""
  const answer   = body.answer?.trim()   ?? ""

  if (!question) return apiError("Поле question обязательно", 400)
  if (!answer)   return apiError("Поле answer обязательно", 400)

  if (question.length > 2000) return apiError("Поле question слишком длинное", 400)
  if (answer.length > 4000)   return apiError("Поле answer слишком длинное", 400)

  await db.insert(nancyFeedback).values({
    companyId: user.companyId,
    userId:    user.id,
    rating:    body.rating,
    question,
    answer,
    module:    body.module?.slice(0, 64) ?? null,
    page:      body.page?.slice(0, 256) ?? null,
  })

  return NextResponse.json({ ok: true })
}
