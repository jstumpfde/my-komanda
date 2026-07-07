// /api/admin/tip/prompt-layers — список редактируемых слоёв промптов методики.
// Гейт — тот же паттерн, что /admin/platform: requireAdminPanelAccess.

import { NextResponse } from "next/server"
import { asc } from "drizzle-orm"
import { db } from "@/lib/db"
import { tipPromptLayers } from "@/lib/db/schema"
import { requireAdminPanelAccess } from "@/lib/platform/auth"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    await requireAdminPanelAccess()
  } catch (e) {
    return e as Response
  }

  const rows = await db
    .select({
      id:        tipPromptLayers.id,
      layerKey:  tipPromptLayers.layerKey,
      title:     tipPromptLayers.title,
      content:   tipPromptLayers.content,
      isActive:  tipPromptLayers.isActive,
      updatedAt: tipPromptLayers.updatedAt,
    })
    .from(tipPromptLayers)
    .orderBy(asc(tipPromptLayers.layerKey))

  const layers = rows.map((r) => ({
    id:            r.id,
    layerKey:      r.layerKey,
    title:         r.title,
    contentLength: r.content.length,
    isActive:      r.isActive,
    updatedAt:     r.updatedAt,
  }))

  return NextResponse.json({ layers })
}
