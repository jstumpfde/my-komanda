import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { pulseSurveys, pulseQuestions, pulseResponses } from "@/lib/db/schema"
import { eq, desc, and, isNull, sql } from "drizzle-orm"

// GET /api/modules/hr/pulse-surveys — список пульс-опросов + системные вопросы
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(req.url)
  const type = url.searchParams.get("type") // "surveys" | "questions"

  if (type === "questions") {
    // Системные + тенантские вопросы
    const questions = await db
      .select()
      .from(pulseQuestions)
      .where(
        sql`${pulseQuestions.tenantId} = ${session.user.companyId} OR ${pulseQuestions.tenantId} IS NULL`
      )
      .orderBy(pulseQuestions.sortOrder)

    return NextResponse.json(questions)
  }

  // Список опросов
  const surveys = await db
    .select()
    .from(pulseSurveys)
    .where(eq(pulseSurveys.tenantId, session.user.companyId))
    .orderBy(desc(pulseSurveys.createdAt))

  return NextResponse.json(surveys)
}

// POST /api/modules/hr/pulse-surveys — создать опрос
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()

  const [survey] = await db
    .insert(pulseSurveys)
    .values({
      tenantId:    session.user.companyId,
      title:       body.title || "Пульс-опрос",
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
      closesAt:    body.closesAt ? new Date(body.closesAt) : null,
      status:      body.status || "draft",
      channel:     body.channel || "telegram",
      questionIds: body.questionIds || [],
    })
    .returning()

  return NextResponse.json(survey, { status: 201 })
}
