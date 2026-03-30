/**
 * GET  /api/modules/hr/vacancies-v2  — список вакансий компании
 * POST /api/modules/hr/vacancies-v2  — создать вакансию
 */
import { NextRequest, NextResponse } from "next/server"
import { eq, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
import { requireCompany } from "@/lib/api-helpers"

export async function GET() {
  try {
    const { companyId } = await requireCompany()

    const rows = await db
      .select()
      .from(vacancies)
      .where(eq(vacancies.companyId, companyId))
      .orderBy(desc(vacancies.createdAt))

    return NextResponse.json(rows)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unauthorized"
    return NextResponse.json({ error: msg }, { status: 401 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { companyId, userId } = await requireCompany()
    const body = await req.json()

    const {
      title, city, format, employment, category,
      salaryMin, salaryMax, descriptionJson,
      status = "draft",
    } = body

    if (!title) {
      return NextResponse.json({ error: "title обязателен" }, { status: 400 })
    }

    // Генерируем slug: title → translit + timestamp
    const slug = generateSlug(title)

    const [row] = await db
      .insert(vacancies)
      .values({
        companyId,
        createdBy: userId,
        title,
        city: city ?? null,
        format: format ?? null,
        employment: employment ?? null,
        category: category ?? null,
        salaryMin: salaryMin ?? null,
        salaryMax: salaryMax ?? null,
        status,
        slug,
        descriptionJson: descriptionJson ?? null,
      })
      .returning()

    return NextResponse.json(row, { status: 201 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error"
    if (msg === "Unauthorized") return NextResponse.json({ error: msg }, { status: 401 })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ─── helpers ────────────────────────────────────────────────────────────────

function generateSlug(title: string): string {
  const map: Record<string, string> = {
    а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"yo",ж:"zh",з:"z",и:"i",й:"j",
    к:"k",л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",
    х:"kh",ц:"ts",ч:"ch",ш:"sh",щ:"shch",ъ:"",ы:"y",ь:"",э:"e",ю:"yu",я:"ya",
  }
  const translit = title
    .toLowerCase()
    .split("")
    .map((c) => map[c] ?? c)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)

  return `${translit}-${Date.now()}`
}
