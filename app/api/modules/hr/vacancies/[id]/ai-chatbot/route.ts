// #15-phase2: реальное сохранение AI чат-бот настроек.
import { NextRequest, NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies, companies } from "@/lib/db/schema"
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
        companyKilled: companies.aiChatbotKilled,
      })
      .from(vacancies)
      .leftJoin(companies, eq(companies.id, vacancies.companyId))
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)
    if (!row) return NextResponse.json({ error: "not found" }, { status: 404 })
    return NextResponse.json({
      enabled:  row.enabled,
      settings: row.settings ?? {},
      prompt:   row.prompt ?? "",
      // Группа 22 kill switch: если true — бот не отвечает, даже если тут
      // enabled=true. Нужно для индикатора готовности в UI (панель + Воронка v2).
      companyKilled: row.companyKilled === true,
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
    if (typeof body.enabled === "boolean")  updates.aiChatbotEnabled = body.enabled
    if (body.settings && typeof body.settings === "object") updates.aiChatbotSettings = body.settings
    if (typeof body.prompt === "string")    updates.aiChatbotPrompt = body.prompt.slice(0, 50_000)

    // Без промпта бот не отвечает (см. lib/hh/scan-incoming.ts — гейт
    // требует aiChatbotPrompt непустым), но тумблер выглядел бы включённым.
    // Не позволяем create иллюзию «работает» — независимо от того, какой UI
    // дёрнул этот роут (полная панель или тумблер в конструкторе воронки).
    if (updates.aiChatbotEnabled === true) {
      const promptFromBody = typeof updates.aiChatbotPrompt === "string" ? updates.aiChatbotPrompt : undefined
      // Если prompt пришёл в body (даже пустой строкой) — это и есть финальное
      // записываемое значение, проверяем ЕГО. К снапшоту в БД откатываемся,
      // только когда ключа prompt в body нет вовсе (UPDATE не тронет колонку).
      const promptOk = promptFromBody !== undefined
        ? promptFromBody.trim().length > 0
        : await (async () => {
        const [existing] = await db
          .select({ prompt: vacancies.aiChatbotPrompt })
          .from(vacancies)
          .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
          .limit(1)
        return !!(existing && existing.prompt && existing.prompt.trim())
      })()
      if (!promptOk) {
        return NextResponse.json(
          { error: "Сначала сгенерируйте промпт чат-бота — без него бот не будет отвечать кандидатам" },
          { status: 400 },
        )
      }
    }

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
