import { NextResponse } from "next/server"
import { requireDirector } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { hhTokens } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export async function POST() {
  try {
    const user = await requireDirector()

    await db.delete(hhTokens).where(eq(hhTokens.companyId, user.companyId))

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[HH disconnect]", err)
    return NextResponse.json({ error: "Ошибка отключения" }, { status: 500 })
  }
}
