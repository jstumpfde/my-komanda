// Funnel Builder MVP: GET/PUT конфигурации конструктора воронки.
// Принцип «двойной записи»: при сохранении дополнительно обновляются старые
// поля совместимости (aiChatbotEnabled, aiProcessSettings.followupEnabled),
// чтобы cron'ы и старые компоненты, которые читают эти поля, видели
// корректное состояние воронки. См. drizzle/0127_funnel_builder.sql.

import { NextRequest, NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
import { requireCompany } from "@/lib/api-helpers"
import {
  normalizeFunnelConfig,
  validateFunnelConfig,
  type FunnelBlock,
  type FunnelBlockType,
} from "@/lib/funnel-builder/blocks"

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompany()
    const { id } = await ctx.params
    const [row] = await db
      .select({
        funnelBuilderEnabled: vacancies.funnelBuilderEnabled,
        funnelConfigJson:     vacancies.funnelConfigJson,
      })
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)
    if (!row) return NextResponse.json({ error: "not found" }, { status: 404 })
    return NextResponse.json({
      funnelBuilderEnabled: row.funnelBuilderEnabled,
      funnelConfigJson:     normalizeFunnelConfig(row.funnelConfigJson),
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
      funnelBuilderEnabled?: unknown
      blocks?: unknown
    }

    // Загружаем текущую вакансию — нужно для дополнения недостающих блоков
    // и для двойной записи в aiProcessSettings.
    const [current] = await db
      .select({
        funnelConfigJson:  vacancies.funnelConfigJson,
        aiProcessSettings: vacancies.aiProcessSettings,
      })
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)
    if (!current) return NextResponse.json({ error: "not found" }, { status: 404 })

    const updates: Record<string, unknown> = { updatedAt: new Date() }

    if (typeof body.funnelBuilderEnabled === "boolean") {
      updates.funnelBuilderEnabled = body.funnelBuilderEnabled
    }

    let nextConfig = normalizeFunnelConfig(current.funnelConfigJson)
    if (Array.isArray(body.blocks)) {
      nextConfig = normalizeFunnelConfig({ blocks: body.blocks })
      const err = validateFunnelConfig(nextConfig)
      if (err) return NextResponse.json({ error: err }, { status: 400 })
      updates.funnelConfigJson = nextConfig

      // Двойная запись в старые поля совместимости.
      const findBlock = (t: FunnelBlockType): FunnelBlock | undefined =>
        nextConfig.blocks.find(b => b.type === t)

      const ai = findBlock("ai_chatbot")
      if (ai) updates.aiChatbotEnabled = ai.enabled

      // Дожим: aiProcessSettings.followupEnabled — мягкий флаг.
      // Если его нет — добавляем; cron'ы по нему не ходят, но конструктор
      // и UI смогут увидеть согласованное состояние. Реальная схема
      // дожима живёт в followUpCampaigns; её не трогаем.
      const dozhim = findBlock("dozhim")
      if (dozhim) {
        const prev = (current.aiProcessSettings && typeof current.aiProcessSettings === "object")
          ? current.aiProcessSettings as Record<string, unknown>
          : {}
        updates.aiProcessSettings = { ...prev, followupEnabled: dozhim.enabled }
      }
    }

    const [r] = await db.update(vacancies)
      .set(updates)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .returning({ id: vacancies.id })
    if (!r) return NextResponse.json({ error: "not found" }, { status: 404 })
    return NextResponse.json({
      ok:                   true,
      funnelConfigJson:     nextConfig,
    })
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
