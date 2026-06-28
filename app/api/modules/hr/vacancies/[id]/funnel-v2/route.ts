// Воронка v2 (FUNNEL-V2.md) — GET/PUT конфигурации «стадий».
// Фаза 1: КОНСТРУКТОР без рантайма. Хранение — vacancy.descriptionJson.funnelV2
// (jsonb, без миграции). Видно только владельцу (j.stumpf@yandex.ru): не-владельцу
// отдаём 404 (скрываем фичу, как платформенные эндпоинты). Двойной записи в
// legacy-поля НЕТ — v2 пока ничего не исполняет.

import { NextRequest, NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
import { requireCompany } from "@/lib/api-helpers"
import { isOwnerEmail } from "@/lib/owner"
import { normalizeFunnelV2, type FunnelV2Config } from "@/lib/funnel-v2/types"

function descObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {}
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompany()
    if (!isOwnerEmail(user.email)) return NextResponse.json({ error: "not found" }, { status: 404 })
    const { id } = await ctx.params
    const [row] = await db
      .select({ descriptionJson: vacancies.descriptionJson, runtimeEnabled: vacancies.funnelV2RuntimeEnabled })
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)
    if (!row) return NextResponse.json({ error: "not found" }, { status: 404 })
    const desc = descObj(row.descriptionJson)
    return NextResponse.json({ config: normalizeFunnelV2(desc.funnelV2), runtimeEnabled: row.runtimeEnabled === true })
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompany()
    if (!isOwnerEmail(user.email)) return NextResponse.json({ error: "not found" }, { status: 404 })
    const { id } = await ctx.params
    const body = await req.json().catch(() => ({})) as { config?: unknown; runtimeEnabled?: unknown }

    const [current] = await db
      .select({ descriptionJson: vacancies.descriptionJson, runtimeEnabled: vacancies.funnelV2RuntimeEnabled })
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)
    if (!current) return NextResponse.json({ error: "not found" }, { status: 404 })

    // Частичное обновление. Тумблер движка шлёт { runtimeEnabled },
    // конструктор — { config }. КЛЮЧЕВОЕ: гейт рантайма (process-queue) требует
    // И флаг vacancies.funnel_v2_runtime_enabled, И config.enabled. Поэтому
    // держим их синхронными: config.enabled ВСЕГДА === итоговый флаг рантайма.
    const desc = descObj(current.descriptionJson)
    const currentFlag = current.runtimeEnabled === true
    const effectiveEnabled = typeof body.runtimeEnabled === "boolean" ? body.runtimeEnabled : currentFlag

    // База конфига: из тела (сейв конструктора) либо текущая (тумблер не трогает стадии).
    const baseConfig = normalizeFunnelV2(body.config !== undefined ? body.config : desc.funnelV2)
    const outConfig: FunnelV2Config = { ...baseConfig, enabled: effectiveEnabled }

    const [r] = await db.update(vacancies)
      .set({
        descriptionJson: { ...desc, funnelV2: outConfig },
        funnelV2RuntimeEnabled: effectiveEnabled,
        updatedAt: new Date(),
      })
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .returning({ id: vacancies.id })
    if (!r) return NextResponse.json({ error: "not found" }, { status: 404 })
    return NextResponse.json({ ok: true, config: outConfig, runtimeEnabled: effectiveEnabled })
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
