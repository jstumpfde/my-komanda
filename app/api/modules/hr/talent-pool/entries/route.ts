// Резерв → «База»: ручные/CSV записи (пассивные кандидаты не из откликов).
// GET   — список записей компании.
// POST  { name, position?, company?, source?, email?, phone?, telegram?, comment?, score? }
//          — добавить одну запись.
// POST с { rows: [...] } — массовый импорт (CSV): создаёт пачку записей.
import { NextRequest, NextResponse } from "next/server"
import { desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { talentPoolEntries } from "@/lib/db/schema"
import { requireCompany } from "@/lib/api-helpers"

type EntryInput = {
  name?: string; position?: string; company?: string; source?: string
  email?: string; phone?: string; telegram?: string; comment?: string; score?: number
}

function scoreToStatus(s: number): string {
  if (s >= 80) return "ideal"
  if (s >= 65) return "hot"
  if (s >= 40) return "warming"
  return "cold"
}

function clean(e: EntryInput, companyId: string) {
  const score = Math.max(0, Math.min(100, Math.round(Number(e.score) || 0)))
  return {
    companyId,
    name:     String(e.name ?? "").trim().slice(0, 200),
    position: String(e.position ?? "").trim().slice(0, 200),
    company:  String(e.company ?? "").trim().slice(0, 200),
    source:   String(e.source ?? "").trim().slice(0, 100),
    email:    String(e.email ?? "").trim().slice(0, 200),
    phone:    String(e.phone ?? "").trim().slice(0, 50),
    telegram: String(e.telegram ?? "").trim().slice(0, 100),
    comment:  String(e.comment ?? "").trim().slice(0, 2000),
    score,
    status:   scoreToStatus(score),
  }
}

export async function GET() {
  try {
    const user = await requireCompany()
    const rows = await db.select().from(talentPoolEntries)
      .where(eq(talentPoolEntries.companyId, user.companyId))
      .orderBy(desc(talentPoolEntries.createdAt))
    return NextResponse.json({ entries: rows })
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = await req.json().catch(() => ({})) as EntryInput & { rows?: EntryInput[] }

    // Массовый импорт (CSV).
    if (Array.isArray(body.rows)) {
      const valid = body.rows
        .map(r => clean(r, user.companyId))
        .filter(r => r.name.length > 0)
        .slice(0, 1000)
      if (valid.length === 0) return NextResponse.json({ error: "no valid rows" }, { status: 400 })
      const inserted = await db.insert(talentPoolEntries).values(valid).returning()
      return NextResponse.json({ entries: inserted, count: inserted.length })
    }

    // Одна запись.
    const row = clean(body, user.companyId)
    if (!row.name) return NextResponse.json({ error: "name required" }, { status: 400 })
    const [created] = await db.insert(talentPoolEntries).values(row).returning()
    return NextResponse.json({ entry: created })
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
