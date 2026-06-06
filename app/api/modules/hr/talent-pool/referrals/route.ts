// Резерв → Рефералы: реферальные ссылки сотрудников + правила программы.
// GET   — список ссылок компании + текущие правила (+ дефолты).
// POST   { name, position } — создать ссылку (slug из транслита ФИО, уникален).
// PATCH  { rules }          — обновить правила (в companies.hiring_defaults_json).
import { NextRequest, NextResponse } from "next/server"
import { desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { referralLinks, companies, type CompanyHiringDefaults } from "@/lib/db/schema"
import { requireCompany } from "@/lib/api-helpers"

const DEFAULT_RULES = {
  bonusPerHire:       10000,
  trialMonths:        3,
  maxActiveReferrals: 5,
  standardScreening:  true,
}

function transliterate(text: string): string {
  const map: Record<string, string> = {
    а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"yo",ж:"zh",з:"z",и:"i",й:"y",к:"k",л:"l",
    м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"kh",ц:"ts",ч:"ch",ш:"sh",
    щ:"sch",ъ:"",ы:"y",ь:"",э:"e",ю:"yu",я:"ya",
  }
  return text.toLowerCase().split("").map(ch => map[ch] ?? ch).join("")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

export async function GET() {
  try {
    const user = await requireCompany()
    const links = await db.select().from(referralLinks)
      .where(eq(referralLinks.companyId, user.companyId))
      .orderBy(desc(referralLinks.createdAt))
    const [company] = await db.select({ hd: companies.hiringDefaultsJson })
      .from(companies).where(eq(companies.id, user.companyId)).limit(1)
    const rules = { ...DEFAULT_RULES, ...(company?.hd?.referralRules ?? {}) }
    return NextResponse.json({ links, rules })
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = await req.json().catch(() => ({})) as { name?: string; position?: string }
    const name = (body.name ?? "").trim()
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 })
    const position = (body.position ?? "").trim()

    // slug из транслита ФИО, при коллизии — суффикс -2, -3, …
    const base = transliterate(name) || "ref"
    const existing = await db.select({ slug: referralLinks.slug }).from(referralLinks)
      .where(eq(referralLinks.companyId, user.companyId))
    const taken = new Set(existing.map(r => r.slug))
    let slug = base, i = 2
    while (taken.has(slug)) slug = `${base}-${i++}`

    const [row] = await db.insert(referralLinks)
      .values({ companyId: user.companyId, name, position, slug })
      .returning()
    return NextResponse.json({ link: row })
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = await req.json().catch(() => ({})) as { rules?: Record<string, unknown> }
    const r = body.rules ?? {}
    const clean = {
      bonusPerHire:       Math.max(0, Math.round(Number(r.bonusPerHire) || 0)),
      trialMonths:        Math.max(0, Math.round(Number(r.trialMonths) || 0)),
      maxActiveReferrals: Math.max(0, Math.round(Number(r.maxActiveReferrals) || 0)),
      standardScreening:  r.standardScreening === true,
    }
    const [company] = await db.select({ hd: companies.hiringDefaultsJson })
      .from(companies).where(eq(companies.id, user.companyId)).limit(1)
    const hd: CompanyHiringDefaults = (company?.hd && typeof company.hd === "object") ? company.hd : {}
    await db.update(companies)
      .set({ hiringDefaultsJson: { ...hd, referralRules: clean } })
      .where(eq(companies.id, user.companyId))
    return NextResponse.json({ rules: clean })
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
