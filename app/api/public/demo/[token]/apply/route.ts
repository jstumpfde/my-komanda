import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { nanoid } from "nanoid"
import { db } from "@/lib/db"
import { candidates, demos, vacancies } from "@/lib/db/schema"

type AnketaPayload = {
  telegram?: string
  experienceSummary?: string
  portfolioUrl?: string
  hhUrl?: string
  otherLinks?: string
  employmentPreference?: string
  niches?: string
}

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
      anketa?: AnketaPayload
    }

    if (!body.firstName || !body.lastName || !body.email || !body.phone) {
      return NextResponse.json({ error: "Заполните обязательные поля" }, { status: 400 })
    }

    // Готовим объект анкеты для jsonb. Пропускаем пустые значения.
    const cleanAnketa: Record<string, unknown> = {}
    if (body.anketa) {
      for (const [k, v] of Object.entries(body.anketa)) {
        if (typeof v === "string" && v.trim().length > 0) cleanAnketa[k] = v.trim()
      }
    }
    if (body.birthDate) cleanAnketa.birthDate = body.birthDate
    cleanAnketa.submittedAt = new Date().toISOString()

    // Find candidate by token
    const [existing] = await db
      .select({ id: candidates.id, vacancyId: candidates.vacancyId, anketaAnswers: candidates.anketaAnswers })
      .from(candidates)
      .where(eq(candidates.token, token))
      .limit(1)

    if (existing) {
      // Слияние с уже сохранёнными ответами (jsonb)
      const prev = (existing.anketaAnswers as Record<string, unknown> | null) ?? {}
      const merged = { ...prev, ...cleanAnketa }

      await db
        .update(candidates)
        .set({
          name: `${body.firstName} ${body.lastName}`,
          email: body.email,
          phone: body.phone,
          city: body.city || null,
          anketaAnswers: merged,
          updatedAt: new Date(),
        })
        .where(eq(candidates.id, existing.id))

      return NextResponse.json({ success: true, id: existing.id })
    }

    // Fallback: нет кандидата с таким токеном — создаём нового.
    // Берём первую активную вакансию из demos (исторический fallback).
    const [demo] = await db
      .select({ vacancyId: demos.vacancyId })
      .from(demos)
      .limit(1)

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
        anketaAnswers: cleanAnketa,
      })
      .returning()

    return NextResponse.json({ success: true, id: candidate.id }, { status: 201 })
  } catch (err) {
    console.error("demo apply error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
