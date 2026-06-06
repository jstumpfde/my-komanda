// Резерв → Кампании прогрева. Управление кампаниями (без реальной отправки).
// GET  — список кампаний компании + KPI (активных / в прогреве / конверсия).
// POST { name, channel } — создать кампанию (статус 'active', счётчики 0).
import { NextRequest, NextResponse } from "next/server"
import { desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { talentCampaigns } from "@/lib/db/schema"
import { requireCompany } from "@/lib/api-helpers"

const CHANNELS = ["email", "telegram", "both"] as const

export async function GET() {
  try {
    const user = await requireCompany()
    const rows = await db.select().from(talentCampaigns)
      .where(eq(talentCampaigns.companyId, user.companyId))
      .orderBy(desc(talentCampaigns.createdAt))

    // KPI: активных кампаний, всего «в прогреве» (sent-replied по активным),
    // средняя конверсия (replied/sent).
    const active = rows.filter(r => r.status === "active")
    const warming = active.reduce((s, r) => s + Math.max(0, r.sentCount - r.repliedCount), 0)
    const totalSent = rows.reduce((s, r) => s + r.sentCount, 0)
    const totalReplied = rows.reduce((s, r) => s + r.repliedCount, 0)
    const conversion = totalSent > 0 ? Math.round((totalReplied / totalSent) * 100) : 0

    return NextResponse.json({
      campaigns: rows,
      kpi: { active: active.length, warming, conversion },
    })
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = await req.json().catch(() => ({})) as { name?: string; channel?: string }
    const name = (body.name ?? "").trim()
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 })
    const channel = CHANNELS.includes(body.channel as never) ? body.channel! : "email"

    const [row] = await db.insert(talentCampaigns)
      .values({ companyId: user.companyId, name, channel })
      .returning()
    return NextResponse.json({ campaign: row })
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
