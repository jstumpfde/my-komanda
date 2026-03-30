/**
 * POST /api/public/apply-v2
 * Публичный эндпоинт: отклик кандидата на вакансию.
 * Авторизация НЕ требуется.
 */
import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies, candidates } from "@/lib/db/schema"
import { randomBytes } from "crypto"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { slug, name, email, phone, city } = body

    if (!slug || !name) {
      return NextResponse.json({ error: "slug и name обязательны" }, { status: 400 })
    }

    // Найти вакансию по slug
    const [vacancy] = await db
      .select({ id: vacancies.id, status: vacancies.status })
      .from(vacancies)
      .where(eq(vacancies.slug, slug))
      .limit(1)

    if (!vacancy) {
      return NextResponse.json({ error: "Вакансия не найдена" }, { status: 404 })
    }

    if (vacancy.status !== "published") {
      return NextResponse.json({ error: "Вакансия не принимает отклики" }, { status: 403 })
    }

    const token = randomBytes(24).toString("hex")

    const [candidate] = await db
      .insert(candidates)
      .values({
        vacancyId: vacancy.id,
        name,
        email:  email ?? null,
        phone:  phone ?? null,
        city:   city ?? null,
        source: "direct",
        stage:  "new",
        token,
      })
      .returning()

    return NextResponse.json({ ok: true, candidateId: candidate.id, token }, { status: 201 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
