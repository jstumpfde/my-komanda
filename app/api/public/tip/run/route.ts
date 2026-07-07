// POST /api/public/tip/run — создать прогон разбора «Типология».
// Публичный роут (без сессии NextAuth) — идентификация через cookie tip_uid
// (см. lib/tip/session.ts). Оплата отключена: доступ только по промокоду
// (переданному в body) или ранее накопленному балансу (бесплатные ссылки).

import { NextRequest, NextResponse } from "next/server"
import { getOrCreateTipUser } from "@/lib/tip/session"
import { createRun, TipServiceError, TipNoBalanceError, type CreateRunInput } from "@/lib/tip/service"
import { getTipContext, getDepth, getAudience } from "@/lib/tip/contexts"

export const runtime = "nodejs"

interface RunRequestBody {
  name?: string
  gender?: string
  birthDate?: string
  context?: string
  role?: string
  depth?: string
  audience?: string
  question?: string
  second?: { name?: string; birthDate?: string }
  promoCode?: string
}

export async function POST(req: NextRequest) {
  let body: RunRequestBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Некорректное тело запроса" }, { status: 400 })
  }

  if (!body.birthDate?.trim()) {
    return NextResponse.json({ error: "Дата рождения обязательна. Укажите её в формате ДД.ММ.ГГГГ." }, { status: 400 })
  }
  if (!body.context || !getTipContext(body.context)) {
    return NextResponse.json({ error: `Неизвестный контекст разбора: «${body.context ?? ""}».` }, { status: 400 })
  }
  if (!body.depth || !getDepth(body.depth)) {
    return NextResponse.json({ error: `Неизвестная глубина разбора: «${body.depth ?? ""}».` }, { status: 400 })
  }
  if (!body.audience || !getAudience(body.audience)) {
    return NextResponse.json({ error: `Неизвестное назначение разбора: «${body.audience ?? ""}».` }, { status: 400 })
  }
  if (body.second?.birthDate !== undefined && !body.second.birthDate.trim()) {
    return NextResponse.json({ error: "Дата рождения второго человека не может быть пустой." }, { status: 400 })
  }

  const user = await getOrCreateTipUser()

  const input: CreateRunInput = {
    name: body.name,
    gender: body.gender,
    birthDate: body.birthDate,
    context: body.context,
    role: body.role,
    depth: body.depth,
    audience: body.audience,
    question: body.question,
    second: body.second?.birthDate ? { name: body.second.name, birthDate: body.second.birthDate } : undefined,
    promoCode: body.promoCode,
  }

  try {
    const result = await createRun(user, input)
    return NextResponse.json({ runId: result.runId, balanceRuns: result.balanceRuns }, { status: 200 })
  } catch (e) {
    if (e instanceof TipNoBalanceError) {
      return NextResponse.json({ error: "no_balance" }, { status: 402 })
    }
    if (e instanceof TipServiceError) {
      return NextResponse.json({ error: e.message }, { status: 400 })
    }
    // eslint-disable-next-line no-console
    console.error("[tip] POST /api/public/tip/run", e)
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 })
  }
}
