import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { candidates, vacancies } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    const { id: vacancyId } = await ctx.params

    // Проверяем что вакансия существует
    const [vac] = await db.select({ id: vacancies.id }).from(vacancies).where(eq(vacancies.id, vacancyId)).limit(1)
    if (!vac) return NextResponse.json({ error: "vacancy not found" }, { status: 404 })

    // Ищем существующего превью-кандидата для этой вакансии
    const PREVIEW_NAME = "[Превью] Директор"
    const [existing] = await db
      .select({ id: candidates.id, token: candidates.token })
      .from(candidates)
      .where(and(eq(candidates.vacancyId, vacancyId), eq(candidates.name, PREVIEW_NAME)))
      .limit(1)

    if (existing && existing.token) {
      return NextResponse.json({ token: existing.token, reused: true })
    }

    // Создаём нового
    const newToken = Math.random().toString(36).slice(2) + Date.now().toString(36)
    const [created] = await db.insert(candidates).values({
      vacancyId,
      name: PREVIEW_NAME,
      source: "preview",
      stage: "demo_opened",
      token: newToken,
    }).returning({ token: candidates.token })

    return NextResponse.json({ token: created.token, reused: false })
  } catch (e) {
    console.error("[preview-candidate]", e)
    return NextResponse.json({ error: "server error" }, { status: 500 })
  }
}
