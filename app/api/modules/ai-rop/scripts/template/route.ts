// POST /api/modules/ai-rop/scripts/template?key=mp|mk|cold|deal
// Создаёт скрипт продаж компании из готового шаблона (lib/ai-rop/script-templates.ts).
// Доступ: requireRopManage (директор).
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { ropSalesScripts } from "@/lib/db/schema"
import { apiError } from "@/lib/api-helpers"
import { requireRopManage } from "@/lib/ai-rop/access"
import { TEMPLATES, type TemplateKey } from "@/lib/ai-rop/script-templates"

export async function POST(req: NextRequest) {
  try {
    const user = await requireRopManage()
    const key = req.nextUrl.searchParams.get("key") as TemplateKey | null
    if (!key || !(key in TEMPLATES)) return apiError("Неизвестный ключ шаблона", 400)

    const t = TEMPLATES[key]
    const [created] = await db
      .insert(ropSalesScripts)
      .values({
        tenantId: user.companyId,
        name: t.name,
        product: t.code,
        direction: t.direction,
        contentMd: t.content_md,
        checklistJson: t.checklist,
        isActive: true,
      })
      .returning({ id: ropSalesScripts.id })

    return NextResponse.json({ ok: true, id: created?.id })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/scripts/template] error:", err)
    return apiError("Internal server error", 500)
  }
}
