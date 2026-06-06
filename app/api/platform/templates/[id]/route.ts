// Group 16: PUT/DELETE для конкретного платформенного шаблона.
// Защита: X-Platform-Admin-Key.

import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { platformFunnelTemplates } from "@/lib/db/schema"
import { requirePlatformKey } from "@/lib/platform/auth"
import { normalizeFunnelConfig } from "@/lib/funnel-builder/blocks"

export const dynamic = "force-dynamic"

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = requirePlatformKey(req)
  if (denied) return denied
  try {
    const { id } = await ctx.params
    const body = await req.json().catch(() => ({})) as {
      name?:        unknown
      description?: unknown
      industry?:    unknown
      configJson?:  unknown
      isPublished?: unknown
    }

    const [existing] = await db.select()
      .from(platformFunnelTemplates)
      .where(eq(platformFunnelTemplates.id, id))
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
    if (body.industry !== undefined) {
      updates.industry = typeof body.industry === "string" ? body.industry.slice(0, 100) : null
    }
    if (body.configJson !== undefined) {
      const rawCfg = body.configJson && typeof body.configJson === "object"
        ? body.configJson
        : { blocks: Array.isArray(body.configJson) ? body.configJson : [] }
      updates.configJson = normalizeFunnelConfig(rawCfg)
    }
    if (typeof body.isPublished === "boolean") {
      updates.isPublished = body.isPublished
    }

    const [updated] = await db.update(platformFunnelTemplates)
      .set(updates)
      .where(eq(platformFunnelTemplates.id, id))
      .returning()

    return NextResponse.json({ ok: true, template: updated })
  } catch (err) {
    console.error("[platform/templates PUT]", err)
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = requirePlatformKey(req)
  if (denied) return denied
  try {
    const { id } = await ctx.params
    const [deleted] = await db.delete(platformFunnelTemplates)
      .where(eq(platformFunnelTemplates.id, id))
      .returning({ id: platformFunnelTemplates.id })
    if (!deleted) return NextResponse.json({ error: "not found" }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[platform/templates DELETE]", err)
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
