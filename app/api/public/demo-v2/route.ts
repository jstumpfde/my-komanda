/**
 * GET  /api/public/demo-v2?token=...  — получить демо для кандидата
 * POST /api/public/demo-v2            — сохранить прогресс кандидата
 * Авторизация НЕ требуется.
 */
import { NextRequest, NextResponse } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, demos, vacancies } from "@/lib/db/schema"

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")
  if (!token) return NextResponse.json({ error: "token обязателен" }, { status: 400 })

  const [candidate] = await db
    .select()
    .from(candidates)
    .where(eq(candidates.token, token))
    .limit(1)

  if (!candidate) return NextResponse.json({ error: "Кандидат не найден" }, { status: 404 })

  // Найти опубликованное демо для вакансии
  const [demo] = await db
    .select()
    .from(demos)
    .where(and(eq(demos.vacancyId, candidate.vacancyId), eq(demos.status, "published")))
    .orderBy(demos.createdAt)
    .limit(1)

  // Получить название вакансии
  const [vacancy] = await db
    .select({ title: vacancies.title })
    .from(vacancies)
    .where(eq(vacancies.id, candidate.vacancyId))
    .limit(1)

  return NextResponse.json({
    candidate: {
      id: candidate.id,
      name: candidate.name,
      stage: candidate.stage,
      demoProgressJson: candidate.demoProgressJson,
    },
    vacancy: { title: vacancy?.title ?? "" },
    demo: demo ? {
      id: demo.id,
      title: demo.title,
      lessonsJson: demo.lessonsJson,
    } : null,
  })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { token, progress } = body

    if (!token) return NextResponse.json({ error: "token обязателен" }, { status: 400 })

    const [candidate] = await db
      .select({ id: candidates.id, stage: candidates.stage })
      .from(candidates)
      .where(eq(candidates.token, token))
      .limit(1)

    if (!candidate) return NextResponse.json({ error: "Не найдено" }, { status: 404 })

    // Обновляем прогресс, при завершении меняем стадию на demo
    const isCompleted = progress?.completed === true
    await db
      .update(candidates)
      .set({
        demoProgressJson: progress,
        stage: isCompleted && candidate.stage === "new" ? "demo" : candidate.stage,
        updatedAt: new Date(),
      })
      .where(eq(candidates.id, candidate.id))

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
