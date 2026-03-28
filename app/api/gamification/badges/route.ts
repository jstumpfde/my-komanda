import { NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { badges } from "@/lib/db/schema"
import { eq, isNull, or } from "drizzle-orm"

export async function GET() {
  let user: { companyId: string }
  try { user = await requireCompany() } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  const all = await db
    .select()
    .from(badges)
    .where(or(
      isNull(badges.tenantId),
      eq(badges.tenantId, user.companyId),
    ))
    .orderBy(badges.points)

  return NextResponse.json(all)
}
