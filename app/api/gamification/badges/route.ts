import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { badges } from "@/lib/db/schema"
import { eq, isNull, or } from "drizzle-orm"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const all = await db
    .select()
    .from(badges)
    .where(or(
      isNull(badges.tenantId),
      eq(badges.tenantId, session.user.companyId),
    ))
    .orderBy(badges.points)

  return NextResponse.json(all)
}
