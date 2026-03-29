import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { exitSurveys, offboardingCases } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"

const EXIT_QUESTIONS = [
  { id: "q1", question: "Что послужило основной причиной ухода?" },
  { id: "q2", question: "Насколько вы были удовлетворены условиями работы? (1-10)" },
  { id: "q3", question: "Как вы оцениваете отношения с руководителем? (1-10)" },
  { id: "q4", question: "Были ли у вас возможности для роста и развития?" },
  { id: "q5", question: "Что бы вы изменили в компании?" },
  { id: "q6", question: "Рассмотрели бы вы возвращение в компанию в будущем?" },
  { id: "q7", question: "Порекомендовали бы вы компанию как место работы?" },
]

// GET /api/modules/hr/offboarding/[id]/exit-survey
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const surveys = await db
    .select()
    .from(exitSurveys)
    .where(eq(exitSurveys.caseId, id))

  return NextResponse.json({ surveys, questions: EXIT_QUESTIONS })
}

// POST /api/modules/hr/offboarding/[id]/exit-survey — create/send exit survey
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()

  // Verify the case belongs to this tenant
  const [c] = await db
    .select()
    .from(offboardingCases)
    .where(and(eq(offboardingCases.id, id), eq(offboardingCases.tenantId, session.user.companyId)))
    .limit(1)
  if (!c) return NextResponse.json({ error: "Case not found" }, { status: 404 })

  if (body.action === "send") {
    const [survey] = await db.insert(exitSurveys).values({
      caseId:  id,
      channel: body.channel || "web",
      status:  "sent",
      sentAt:  new Date(),
    }).returning()
    return NextResponse.json(survey, { status: 201 })
  }

  if (body.action === "submit") {
    const [updated] = await db
      .update(exitSurveys)
      .set({
        status:        "completed",
        completedAt:   new Date(),
        responses:     body.responses,
        overallScore:  body.overallScore,
        wouldReturn:   body.wouldReturn,
        wouldRecommend:body.wouldRecommend,
        openFeedback:  body.openFeedback,
      })
      .where(eq(exitSurveys.id, body.surveyId))
      .returning()
    return NextResponse.json(updated)
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}
