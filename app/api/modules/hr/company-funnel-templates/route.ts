// Group 15: библиотека пер-компанийных шаблонов воронки.
// GET — список шаблонов компании; POST — создать новый.
// См. drizzle/0130_company_funnel_templates.sql и lib/funnel-builder/blocks.ts.

import { NextRequest, NextResponse } from "next/server"
import { and, asc, desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { companyFunnelTemplates } from "@/lib/db/schema"
import { requireCompany } from "@/lib/api-helpers"
import { normalizeFunnelConfig } from "@/lib/funnel-builder/blocks"

export async function GET() {
  try {
    const user = await requireCompany()
    const rows = await db
      .select({
        id:          companyFunnelTemplates.id,
        name:        companyFunnelTemplates.name,
        description: companyFunnelTemplates.description,
        configJson:  companyFunnelTemplates.configJson,
        isDefault:   companyFunnelTemplates.isDefault,
        createdAt:   companyFunnelTemplates.createdAt,
        updatedAt:   companyFunnelTemplates.updatedAt,
      })
      .from(companyFunnelTemplates)
      .where(eq(companyFunnelTemplates.companyId, user.companyId))
      .orderBy(desc(companyFunnelTemplates.isDefault), asc(companyFunnelTemplates.name))
    return NextResponse.json({ templates: rows })
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = await req.json().catch(() => ({})) as {
      name?:        unknown
      description?: unknown
      configJson?:  unknown
      isDefault?:   unknown
    }
    const name = typeof body.name === "string" ? body.name.trim() : ""
    if (name.length === 0) {
      return NextResponse.json({ error: "name обязателен" }, { status: 400 })
    }
    if (name.length > 200) {
      return NextResponse.json({ error: "name слишком длинный (max 200)" }, { status: 400 })
    }
    const description = typeof body.description === "string" ? body.description.slice(0, 1000) : null
    // Нормализуем конфиг перед сохранением — это и валидация, и backfill
    // недостающих блоков. Принимаем как { blocks: [...] }, так и [blocks...].
    const rawCfg = body.configJson && typeof body.configJson === "object"
      ? body.configJson
      : { blocks: Array.isArray(body.configJson) ? body.configJson : [] }
    const configJson = normalizeFunnelConfig(rawCfg)
    const wantDefault = body.isDefault === true

    // Если ставим default — сначала снимаем default с остальных шаблонов
    // компании. Транзакция здесь не критична (читателей мало), но всё же.
    const created = await db.transaction(async (tx) => {
      if (wantDefault) {
        await tx.update(companyFunnelTemplates)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(and(
            eq(companyFunnelTemplates.companyId, user.companyId),
            eq(companyFunnelTemplates.isDefault, true),
          ))
      }
      const [row] = await tx.insert(companyFunnelTemplates).values({
        companyId:   user.companyId,
        name,
        description,
        configJson,
        isDefault:   wantDefault,
        createdBy:   user.id,
      }).returning()
      return row
    })

    return NextResponse.json({ ok: true, template: created })
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
