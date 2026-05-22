// Group 15: PUT/DELETE для конкретного пер-компанийного шаблона воронки.
// См. drizzle/0130_company_funnel_templates.sql.

import { NextRequest, NextResponse } from "next/server"
import { and, eq, ne } from "drizzle-orm"
import { db } from "@/lib/db"
import { companyFunnelTemplates } from "@/lib/db/schema"
import { requireCompany } from "@/lib/api-helpers"
import { normalizeFunnelConfig } from "@/lib/funnel-builder/blocks"

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompany()
    const { id } = await ctx.params
    const body = await req.json().catch(() => ({})) as {
      name?:        unknown
      description?: unknown
      configJson?:  unknown
      isDefault?:   unknown
    }

    const [existing] = await db.select()
      .from(companyFunnelTemplates)
      .where(and(eq(companyFunnelTemplates.id, id), eq(companyFunnelTemplates.companyId, user.companyId)))
      .limit(1)
    if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 })

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (typeof body.name === "string") {
      const name = body.name.trim()
      if (name.length === 0) {
        return NextResponse.json({ error: "name обязателен" }, { status: 400 })
      }
      if (name.length > 200) {
        return NextResponse.json({ error: "name слишком длинный (max 200)" }, { status: 400 })
      }
      updates.name = name
    }
    if (body.description !== undefined) {
      updates.description = typeof body.description === "string" ? body.description.slice(0, 1000) : null
    }
    if (body.configJson !== undefined) {
      const rawCfg = body.configJson && typeof body.configJson === "object"
        ? body.configJson
        : { blocks: Array.isArray(body.configJson) ? body.configJson : [] }
      updates.configJson = normalizeFunnelConfig(rawCfg)
    }

    const wantDefaultToggle = typeof body.isDefault === "boolean"
    const becomingDefault = wantDefaultToggle && body.isDefault === true && !existing.isDefault

    const result = await db.transaction(async (tx) => {
      if (becomingDefault) {
        await tx.update(companyFunnelTemplates)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(and(
            eq(companyFunnelTemplates.companyId, user.companyId),
            eq(companyFunnelTemplates.isDefault, true),
            ne(companyFunnelTemplates.id, id),
          ))
      }
      if (wantDefaultToggle) updates.isDefault = body.isDefault as boolean
      const [updated] = await tx.update(companyFunnelTemplates)
        .set(updates)
        .where(and(eq(companyFunnelTemplates.id, id), eq(companyFunnelTemplates.companyId, user.companyId)))
        .returning()
      return updated
    })

    return NextResponse.json({ ok: true, template: result })
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompany()
    const { id } = await ctx.params
    const [deleted] = await db.delete(companyFunnelTemplates)
      .where(and(eq(companyFunnelTemplates.id, id), eq(companyFunnelTemplates.companyId, user.companyId)))
      .returning({ id: companyFunnelTemplates.id })
    if (!deleted) return NextResponse.json({ error: "not found" }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
