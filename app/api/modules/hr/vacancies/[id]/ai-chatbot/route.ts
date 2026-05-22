// PUT/PATCH /api/modules/hr/vacancies/[id]/ai-chatbot
//
// #15 Фаза 1: заглушка. Принимает любое тело, возвращает 200 OK с
// текущим состоянием из БД. Ничего не пишет, потому что UI пока
// полностью disabled. В Фазах 2-6 эндпоинт станет реальным.

import { NextRequest, NextResponse } from "next/server"

export { PUT as PATCH }

export async function PUT(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await ctx.params
  return NextResponse.json({ ok: true, phase: 1, note: "AI chatbot scaffolding — UI disabled" })
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await ctx.params
  return NextResponse.json({
    enabled:  false,
    settings: {},
    prompt:   "",
    phase:    1,
  })
}
