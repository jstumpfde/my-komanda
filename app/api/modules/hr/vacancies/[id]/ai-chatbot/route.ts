// #15-phase2: реальное сохранение AI чат-бот настроек.
import { NextRequest, NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
import { requireCompany } from "@/lib/api-helpers"

export { PUT as PATCH }

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompany()
    const { id } = await ctx.params
    const [row] = await db
      .select({
        enabled:  vacancies.aiChatbotEnabled,
        settings: vacancies.aiChatbotSettings,
        prompt:   vacancies.aiChatbotPrompt,
      })
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)
    if (!row) return NextResponse.json({ error: "not found" }, { status: 404 })
    return NextResponse.json({
      enabled:  row.enabled,
      settings: row.settings ?? {},
      prompt:   row.prompt ?? "",
    })
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompany()
    const { id } = await ctx.params
    const body = await req.json().catch(() => ({})) as {
      enabled?: unknown; settings?: unknown; prompt?: unknown
    }
    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (typeof body.enabled === "boolean") {
      updates.aiChatbotEnabled = body.enabled
      // Взаимоисключение с движком Воронки v2 (решение Юрия 02.07): чат-бот и v2 —
      // либо/либо. Включаем чат-бот → выключаем движок Воронки v2.
      if (body.enabled === true) updates.funnelV2RuntimeEnabled = false
    }
    if (body.settings && typeof body.settings === "object") updates.aiChatbotSettings = body.settings
    if (typeof body.prompt === "string")    updates.aiChatbotPrompt = body.prompt.slice(0, 50_000)

    const [r] = await db.update(vacancies)
      .set(updates)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .returning({ id: vacancies.id })
    if (!r) return NextResponse.json({ error: "not found" }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
