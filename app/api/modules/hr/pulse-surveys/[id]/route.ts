import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { pulseSurveys, pulseResponses } from "@/lib/db/schema"
import { eq, and, avg, count } from "drizzle-orm"

// GET /api/modules/hr/pulse-surveys/[id] — опрос с результатами
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const [survey] = await db
    .select()
    .from(pulseSurveys)
    .where(and(
      eq(pulseSurveys.id, id),
      eq(pulseSurveys.tenantId, session.user.companyId),
    ))
    .limit(1)

  if (!survey) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Агрегация ответов
  const responses = await db
    .select({
      questionId:  pulseResponses.questionId,
      avgScore:    avg(pulseResponses.score),
      totalCount:  count(),
    })
    .from(pulseResponses)
    .where(eq(pulseResponses.surveyId, id))
    .groupBy(pulseResponses.questionId)

  return NextResponse.json({ survey, responses })
}

// PATCH /api/modules/hr/pulse-surveys/[id] — обновить статус
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()

  const [updated] = await db
    .update(pulseSurveys)
    .set({
      status:      body.status,
      sentAt:      body.status === "sent" ? new Date() : undefined,
      title:       body.title,
      channel:     body.channel,
      questionIds: body.questionIds,
    })
    .where(and(
      eq(pulseSurveys.id, id),
      eq(pulseSurveys.tenantId, session.user.companyId),
    ))
    .returning()

  return NextResponse.json(updated)
}
