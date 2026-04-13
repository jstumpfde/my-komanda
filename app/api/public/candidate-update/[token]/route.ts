import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies, companies } from "@/lib/db/schema"
import { checkRateLimit } from "@/lib/rate-limit"

// GET — get candidate data for update form
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const ip = req.headers.get("x-forwarded-for") || "unknown"
    if (!checkRateLimit(`cupdate:${ip}`, 10, 60000)) {
      return NextResponse.json({ error: "Слишком много запросов" }, { status: 429 })
    }

    const { token } = await params

    const [candidate] = await db
      .select()
      .from(candidates)
      .where(eq(candidates.token, token))
      .limit(1)

    if (!candidate) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 })
    }

    const [vacancy] = await db
      .select({ title: vacancies.title, companyId: vacancies.companyId })
      .from(vacancies)
      .where(eq(vacancies.id, candidate.vacancyId))
      .limit(1)

    const [company] = vacancy
      ? await db.select({ name: companies.name }).from(companies).where(eq(companies.id, vacancy.companyId)).limit(1)
      : [null]

    // Determine missing fields
    const missingFields: string[] = []
    if (!candidate.email?.trim()) missingFields.push("Email")
    if (!candidate.phone?.trim()) missingFields.push("Телефон")
    if (!candidate.city?.trim()) missingFields.push("Город")
    if (!candidate.experience?.trim()) missingFields.push("Опыт работы")

    return NextResponse.json({
      name: candidate.name,
      email: candidate.email,
      phone: candidate.phone,
      city: candidate.city,
      experience: candidate.experience,
      vacancyTitle: vacancy?.title || "вакансию",
      companyName: company?.name || "Компания",
      missingFields,
    })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST — update candidate data
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const ip = req.headers.get("x-forwarded-for") || "unknown"
    if (!checkRateLimit(`cupdate-post:${ip}`, 5, 60000)) {
      return NextResponse.json({ error: "Слишком много запросов" }, { status: 429 })
    }

    const { token } = await params
    const body = (await req.json()) as { email?: string; phone?: string; city?: string; experience?: string }

    const [candidate] = await db
      .select({ id: candidates.id })
      .from(candidates)
      .where(eq(candidates.token, token))
      .limit(1)

    if (!candidate) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 })
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (body.email?.trim()) updates.email = body.email.trim()
    if (body.phone?.trim()) updates.phone = body.phone.trim()
    if (body.city?.trim()) updates.city = body.city.trim()
    if (body.experience?.trim()) updates.experience = body.experience.trim()

    await db.update(candidates).set(updates).where(eq(candidates.id, candidate.id))

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
