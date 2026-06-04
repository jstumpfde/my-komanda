// Резерв → Формы: tracking-ссылки. GET список, POST создать (slug авто-уникален).
import { NextRequest, NextResponse } from "next/server"
import { desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { formTrackingLinks } from "@/lib/db/schema"
import { requireCompany } from "@/lib/api-helpers"

function slugify(s: string): string {
  const map: Record<string, string> = {
    а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"yo",ж:"zh",з:"z",и:"i",й:"y",к:"k",л:"l",м:"m",
    н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"kh",ц:"ts",ч:"ch",ш:"sh",щ:"sch",ъ:"",ы:"y",ь:"",э:"e",ю:"yu",я:"ya",
  }
  return s.toLowerCase().split("").map(c => map[c] ?? c).join("").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}
function rand(n: number): string {
  const a = "abcdefghijklmnopqrstuvwxyz0123456789"
  let r = ""; for (let i = 0; i < n; i++) r += a[Math.floor(Math.random() * a.length)]
  return r
}

export async function GET() {
  try {
    const user = await requireCompany()
    const rows = await db.select().from(formTrackingLinks)
      .where(eq(formTrackingLinks.companyId, user.companyId))
      .orderBy(desc(formTrackingLinks.createdAt))
    return NextResponse.json({ links: rows })
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = await req.json().catch(() => ({})) as { source?: string; name?: string; formId?: string }
    const source = (body.source ?? "").trim().slice(0, 100)
    const name = (body.name ?? "").trim().slice(0, 200)
    if (!name || !source) return NextResponse.json({ error: "source & name required" }, { status: 400 })
    const slug = `${slugify(source) || "src"}-${slugify(name) || "x"}-${rand(6)}`.slice(0, 120)
    const [row] = await db.insert(formTrackingLinks).values({
      companyId: user.companyId,
      formId: body.formId && /^[0-9a-f-]{36}$/i.test(body.formId) ? body.formId : null,
      source, name, slug,
    }).returning()
    return NextResponse.json({ link: row })
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
