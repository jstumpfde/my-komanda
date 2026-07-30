// GET /api/modules/ai-rop/scripts — список скриптов продаж компании (включая неактивные).
// POST — создать новый скрипт.
// Доступ: requireRopTeam на чтение, requireRopManage (директор) на запись.
import { NextResponse } from "next/server"
import { asc, desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropSalesScripts } from "@/lib/db/schema"
import { apiError } from "@/lib/api-helpers"
import { requireRopManage, requireRopTeam } from "@/lib/ai-rop/access"
import type { ChecklistItem } from "@/lib/ai-rop/types"

export async function GET() {
  try {
    const user = await requireRopTeam()
    const rows = await db
      .select()
      .from(ropSalesScripts)
      .where(eq(ropSalesScripts.tenantId, user.companyId))
      .orderBy(desc(ropSalesScripts.isActive), asc(ropSalesScripts.product), asc(ropSalesScripts.name))
    return NextResponse.json({ ok: true, items: rows })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/scripts] GET error:", err)
    return apiError("Internal server error", 500)
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRopManage()
    const body = (await req.json().catch(() => ({}))) as {
      name?: string
      product?: string | null
      direction?: "in" | "out" | "all"
      content_md?: string
      checklist?: ChecklistItem[]
      key_phrases?: string | null
      is_active?: boolean
    }
    if (!body.name) return apiError("name обязателен", 400)

    const [created] = await db
      .insert(ropSalesScripts)
      .values({
        tenantId: user.companyId,
        name: body.name,
        product: body.product?.trim() || null,
        direction: body.direction || "all",
        contentMd: body.content_md || "",
        checklistJson: body.checklist ?? [],
        keyPhrases: body.key_phrases?.trim() || null,
        isActive: body.is_active !== false,
      })
      .returning({ id: ropSalesScripts.id })

    return NextResponse.json({ ok: true, id: created?.id })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/scripts] POST error:", err)
    return apiError("Internal server error", 500)
  }
}
