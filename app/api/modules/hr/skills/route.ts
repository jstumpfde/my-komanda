import { NextRequest, NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { skills } from "@/lib/db/schema"
import { or, isNull, eq, asc } from "drizzle-orm"

export async function GET() {
  let user: { companyId: string }
  try { user = await requireCompany() } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  const rows = await db
    .select()
    .from(skills)
    .where(or(isNull(skills.tenantId), eq(skills.tenantId, user.companyId)))
    .orderBy(asc(skills.category), asc(skills.name))

  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  let user: { companyId: string }
  try { user = await requireCompany() } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  const body = await req.json()
  if (!body.name?.trim()) return NextResponse.json({ error: "Название обязательно" }, { status: 400 })

  const [skill] = await db.insert(skills).values({
    tenantId: user.companyId,
    name: body.name.trim(),
    category: body.category || "soft",
    description: body.description || null,
  }).returning()

  return NextResponse.json(skill, { status: 201 })
}
