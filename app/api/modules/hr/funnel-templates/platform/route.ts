// Group 16: публичные платформенные шаблоны воронки для HR.
// GET — возвращает is_published=true. Доступен любому авторизованному
// HR с компанией (как и /api/modules/hr/company-funnel-templates).

import { NextResponse } from "next/server"
import { asc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { platformFunnelTemplates } from "@/lib/db/schema"
import { requireCompany } from "@/lib/api-helpers"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    await requireCompany()
    const rows = await db
      .select({
        id:          platformFunnelTemplates.id,
        name:        platformFunnelTemplates.name,
        description: platformFunnelTemplates.description,
        industry:    platformFunnelTemplates.industry,
        configJson:  platformFunnelTemplates.configJson,
      })
      .from(platformFunnelTemplates)
      .where(eq(platformFunnelTemplates.isPublished, true))
      .orderBy(asc(platformFunnelTemplates.industry), asc(platformFunnelTemplates.name))
    return NextResponse.json({ templates: rows })
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
