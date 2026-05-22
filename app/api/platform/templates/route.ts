// Group 16: библиотека пер-платформенных шаблонов воронки.
// GET — список всех (включая unpublished); POST — создать вручную.
// Защита: X-Platform-Admin-Key. См. drizzle/0131_platform_funnel_templates.sql.

import { NextRequest, NextResponse } from "next/server"
import { asc, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { platformFunnelTemplates } from "@/lib/db/schema"
import { requirePlatformKey } from "@/lib/platform/auth"
import { normalizeFunnelConfig } from "@/lib/funnel-builder/blocks"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const denied = requirePlatformKey(req)
  if (denied) return denied
  try {
    const rows = await db
      .select({
        id:               platformFunnelTemplates.id,
        name:             platformFunnelTemplates.name,
        description:      platformFunnelTemplates.description,
        industry:         platformFunnelTemplates.industry,
        configJson:       platformFunnelTemplates.configJson,
        sourceVacancyId:  platformFunnelTemplates.sourceVacancyId,
        sourceCompanyId:  platformFunnelTemplates.sourceCompanyId,
        isPublished:      platformFunnelTemplates.isPublished,
        createdAt:        platformFunnelTemplates.createdAt,
        updatedAt:        platformFunnelTemplates.updatedAt,
      })
      .from(platformFunnelTemplates)
      .orderBy(desc(platformFunnelTemplates.isPublished), asc(platformFunnelTemplates.name))
    return NextResponse.json({ templates: rows })
  } catch (err) {
    console.error("[platform/templates GET]", err)
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const denied = requirePlatformKey(req)
  if (denied) return denied
  try {
    const body = await req.json().catch(() => ({})) as {
      name?:        unknown
      description?: unknown
      industry?:    unknown
      configJson?:  unknown
      isPublished?: unknown
    }
    const name = typeof body.name === "string" ? body.name.trim() : ""
    if (name.length === 0) {
      return NextResponse.json({ error: "name обязателен" }, { status: 400 })
    }
    if (name.length > 200) {
      return NextResponse.json({ error: "name слишком длинный (max 200)" }, { status: 400 })
    }
    const description = typeof body.description === "string" ? body.description.slice(0, 1000) : null
    const industry = typeof body.industry === "string" ? body.industry.slice(0, 100) : null

    const rawCfg = body.configJson && typeof body.configJson === "object"
      ? body.configJson
      : { blocks: Array.isArray(body.configJson) ? body.configJson : [] }
    const configJson = normalizeFunnelConfig(rawCfg)

    const isPublished = body.isPublished === true

    const [row] = await db.insert(platformFunnelTemplates).values({
      name,
      description,
      industry,
      configJson,
      isPublished,
    }).returning()

    return NextResponse.json({ ok: true, template: row })
  } catch (err) {
    console.error("[platform/templates POST]", err)
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
