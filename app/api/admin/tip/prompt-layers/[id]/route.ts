// /api/admin/tip/prompt-layers/[id] — чтение и редактирование одного слоя
// промпта методики (полный content — для открытия в редакторе).
// Гейт — тот же паттерн, что /admin/platform: requireAdminPanelAccess.

import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { tipPromptLayers } from "@/lib/db/schema"
import { requireAdminPanelAccess } from "@/lib/platform/auth"

export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requireAdminPanelAccess()
  } catch (e) {
    return e as Response
  }

  const { id } = await params
  const [row] = await db.select().from(tipPromptLayers).where(eq(tipPromptLayers.id, id)).limit(1)
  if (!row) return NextResponse.json({ error: "Слой не найден" }, { status: 404 })
  return NextResponse.json({ layer: row })
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    await requireAdminPanelAccess()
  } catch (e) {
    return e as Response
  }

  const { id } = await params
  const body = await req.json().catch(() => ({})) as {
    content?: unknown
    isActive?: unknown
    title?: unknown
  }

  const [existing] = await db.select({ id: tipPromptLayers.id }).from(tipPromptLayers).where(eq(tipPromptLayers.id, id)).limit(1)
  if (!existing) return NextResponse.json({ error: "Слой не найден" }, { status: 404 })

  const updates: Partial<typeof tipPromptLayers.$inferInsert> = { updatedAt: new Date() }

  if (body.content !== undefined) {
    if (typeof body.content !== "string" || body.content.trim().length === 0) {
      return NextResponse.json({ error: "content обязателен и не может быть пустым" }, { status: 400 })
    }
    updates.content = body.content
  }
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== "boolean") {
      return NextResponse.json({ error: "isActive должен быть boolean" }, { status: 400 })
    }
    updates.isActive = body.isActive
  }
  if (body.title !== undefined) {
    if (typeof body.title !== "string" || body.title.trim().length === 0) {
      return NextResponse.json({ error: "title не может быть пустым" }, { status: 400 })
    }
    updates.title = body.title.trim().slice(0, 200)
  }

  try {
    const [row] = await db.update(tipPromptLayers).set(updates).where(eq(tipPromptLayers.id, id)).returning()
    return NextResponse.json({ ok: true, layer: row })
  } catch (err) {
    console.error("[admin/tip/prompt-layers/[id] PUT]", err)
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
