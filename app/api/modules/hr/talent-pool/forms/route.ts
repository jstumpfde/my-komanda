// Резерв → Формы: определения форм сбора кандидатов.
// GET  — список форм компании.
// POST { name, type, source, placement, slug, slogan, fields, active } — создать.
import { NextRequest, NextResponse } from "next/server"
import { desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { talentForms } from "@/lib/db/schema"
import { requireCompany } from "@/lib/api-helpers"
import { cleanForm, type FormInput } from "@/lib/talent-pool-forms"

export async function GET() {
  try {
    const user = await requireCompany()
    const rows = await db.select().from(talentForms)
      .where(eq(talentForms.companyId, user.companyId))
      .orderBy(desc(talentForms.createdAt))
    return NextResponse.json({ forms: rows })
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = await req.json().catch(() => ({})) as FormInput
    const row = cleanForm(body, user.companyId)
    if (!row.name) return NextResponse.json({ error: "name required" }, { status: 400 })
    const [created] = await db.insert(talentForms).values(row).returning()
    return NextResponse.json({ form: created })
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
