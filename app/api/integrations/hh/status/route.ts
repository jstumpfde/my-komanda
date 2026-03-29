import { NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { hhTokens } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export async function GET() {
  try {
    const user = await requireCompany()

    const rows = await db
      .select()
      .from(hhTokens)
      .where(eq(hhTokens.companyId, user.companyId))
      .limit(1)

    const token = rows[0]

    if (!token) {
      return NextResponse.json({ connected: false })
    }

    return NextResponse.json({
      connected: true,
      employerId: token.hhEmployerId,
      tokenExpiresAt: token.expiresAt,
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[HH status]", err)
    return NextResponse.json({ error: "Ошибка" }, { status: 500 })
  }
}
