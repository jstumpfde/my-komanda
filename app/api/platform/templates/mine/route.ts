// Group 16: «добыть» (mine) шаблон воронки из конкретной вакансии.
// POST: { sourceVacancyId, name, industry?, description?, isPublished? }
// Копирует vacancies.funnel_config_json в новый platform_funnel_templates.
// Защита: X-Platform-Admin-Key.

import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { platformFunnelTemplates, vacancies } from "@/lib/db/schema"
import { requirePlatformKey } from "@/lib/platform/auth"
import { normalizeFunnelConfig } from "@/lib/funnel-builder/blocks"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const denied = requirePlatformKey(req)
  if (denied) return denied
  try {
    const body = await req.json().catch(() => ({})) as {
      sourceVacancyId?: unknown
      name?:            unknown
      description?:     unknown
      industry?:        unknown
      isPublished?:     unknown
    }

    const sourceVacancyId = typeof body.sourceVacancyId === "string" ? body.sourceVacancyId : ""
    const name = typeof body.name === "string" ? body.name.trim() : ""
    if (!sourceVacancyId) {
      return NextResponse.json({ error: "sourceVacancyId обязателен" }, { status: 400 })
    }
    if (!name) {
      return NextResponse.json({ error: "name обязателен" }, { status: 400 })
    }

    const [vac] = await db.select({
      id:               vacancies.id,
      companyId:        vacancies.companyId,
      funnelConfigJson: vacancies.funnelConfigJson,
    })
      .from(vacancies)
      .where(eq(vacancies.id, sourceVacancyId))
      .limit(1)

    if (!vac) {
      return NextResponse.json({ error: "vacancy not found" }, { status: 404 })
    }

    const configJson = normalizeFunnelConfig(vac.funnelConfigJson)

    const description = typeof body.description === "string" ? body.description.slice(0, 1000) : null
    const industry = typeof body.industry === "string" ? body.industry.slice(0, 100) : null
    const isPublished = body.isPublished === true

    const [row] = await db.insert(platformFunnelTemplates).values({
      name,
      description,
      industry,
      configJson,
      sourceVacancyId:  vac.id,
      sourceCompanyId:  vac.companyId,
      isPublished,
    }).returning()

    return NextResponse.json({ ok: true, template: row })
  } catch (err) {
    console.error("[platform/templates/mine]", err)
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
