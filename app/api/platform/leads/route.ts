// Заявки лендинга/портфолио (landing_leads) — /admin/platform/leads читает
// отсюда. Единая точка входа: /landing (demo/consultation) и /portfolio
// (website) пишут в одну таблицу через /api/public/landing-lead.
import { NextResponse } from "next/server"
import { desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { landingLeads } from "@/lib/db/schema"
import { requirePlatformOperator } from "@/lib/platform/auth"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    await requirePlatformOperator()
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const rows = await db.select().from(landingLeads).orderBy(desc(landingLeads.createdAt)).limit(500)
    return NextResponse.json({ leads: rows })
  } catch (err) {
    console.error("[platform/leads GET]", err)
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
