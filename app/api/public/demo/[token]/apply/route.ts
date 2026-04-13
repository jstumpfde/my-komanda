import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { nanoid } from "nanoid"
import { db } from "@/lib/db"
import { candidates, demos, vacancies } from "@/lib/db/schema"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const body = (await req.json()) as {
      firstName: string
      lastName: string
      email: string
      phone: string
      birthDate?: string
      city?: string
    }

    if (!body.firstName || !body.lastName || !body.email || !body.phone) {
      return NextResponse.json({ error: "Заполните обязательные поля" }, { status: 400 })
    }

    // Find candidate by token
    const [existing] = await db
      .select({ id: candidates.id, vacancyId: candidates.vacancyId })
      .from(candidates)
      .where(eq(candidates.token, token))
      .limit(1)

    if (existing) {
      // Update existing candidate with form data
      await db
        .update(candidates)
        .set({
          name: `${body.firstName} ${body.lastName}`,
          email: body.email,
          phone: body.phone,
          city: body.city || null,
          updatedAt: new Date(),
        })
        .where(eq(candidates.id, existing.id))

      return NextResponse.json({ success: true, id: existing.id })
    }

    // Find vacancy through demo token — look up candidate's demo
    // The token is a candidate token, find their vacancy
    const [demo] = await db
      .select({ vacancyId: demos.vacancyId })
      .from(demos)
      .limit(1)

    // Create new candidate
    const [vacancy] = demo?.vacancyId
      ? await db.select({ companyId: vacancies.companyId }).from(vacancies).where(eq(vacancies.id, demo.vacancyId)).limit(1)
      : [null]

    if (!demo?.vacancyId) {
      return NextResponse.json({ error: "Вакансия не найдена" }, { status: 404 })
    }

    const [candidate] = await db
      .insert(candidates)
      .values({
        vacancyId: demo.vacancyId,
        name: `${body.firstName} ${body.lastName}`,
        email: body.email,
        phone: body.phone,
        city: body.city || null,
        source: "demo",
        stage: "new",
        token: nanoid(12),
      })
      .returning()

    return NextResponse.json({ success: true, id: candidate.id }, { status: 201 })
  } catch (err) {
    console.error("demo apply error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
