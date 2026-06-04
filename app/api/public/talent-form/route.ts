// Публичная отправка формы Резерва (по tracking-ссылке /f/{slug}).
// Кандидат → запись в talent_pool_entries + инкремент candidates у ссылки.
import { NextRequest, NextResponse } from "next/server"
import { eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { formTrackingLinks, talentPoolEntries } from "@/lib/db/schema"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as {
      slug?: string; name?: string; email?: string; phone?: string
      telegram?: string; position?: string; company?: string; comment?: string
    }
    const slug = (body.slug ?? "").trim()
    const name = (body.name ?? "").trim()
    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 })
    if (!name) return NextResponse.json({ error: "Укажите имя" }, { status: 400 })

    const [link] = await db.select().from(formTrackingLinks)
      .where(eq(formTrackingLinks.slug, slug)).limit(1)
    if (!link) return NextResponse.json({ error: "not found" }, { status: 404 })

    await db.insert(talentPoolEntries).values({
      companyId: link.companyId,
      name:     name.slice(0, 200),
      position: (body.position ?? "").trim().slice(0, 200),
      company:  (body.company ?? "").trim().slice(0, 200),
      source:   link.source || "Форма",
      email:    (body.email ?? "").trim().slice(0, 200),
      phone:    (body.phone ?? "").trim().slice(0, 50),
      telegram: (body.telegram ?? "").trim().slice(0, 100),
      comment:  (body.comment ?? "").trim().slice(0, 2000),
    })
    await db.update(formTrackingLinks)
      .set({ candidates: sql`${formTrackingLinks.candidates} + 1` })
      .where(eq(formTrackingLinks.id, link.id))

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
