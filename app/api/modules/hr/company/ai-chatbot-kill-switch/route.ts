// Безопасность: глобальный kill switch для AI-чат-бота на уровне компании.
// GET — текущее состояние; PUT { killed: boolean } — переключение.

import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies } from "@/lib/db/schema"
import { requireCompany, requireDirector } from "@/lib/api-helpers"

export async function GET() {
  try {
    const user = await requireCompany()
    const [row] = await db
      .select({ killed: companies.aiChatbotKilled })
      .from(companies)
      .where(eq(companies.id, user.companyId))
      .limit(1)
    return NextResponse.json({ killed: row?.killed ?? false })
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireDirector()
    const body = await req.json().catch(() => ({})) as { killed?: unknown }
    if (typeof body.killed !== "boolean") {
      return NextResponse.json({ error: "killed must be boolean" }, { status: 400 })
    }
    await db.update(companies)
      .set({ aiChatbotKilled: body.killed, updatedAt: new Date() })
      .where(eq(companies.id, user.companyId))
    return NextResponse.json({ ok: true, killed: body.killed })
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
