import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { calendarEvents, calendarEventParticipants, candidates, testSubmissions } from "@/lib/db/schema"
import { requireCompany } from "@/lib/api-helpers"
import { apiError, apiSuccess } from "@/lib/api-helpers"
import { eq, and, gte, lte, or, inArray, desc, getTableColumns } from "drizzle-orm"

export async function GET(req: NextRequest) {
  try {
    const user = await requireCompany()
    const { searchParams } = new URL(req.url)

    const start = searchParams.get("start")
    const end = searchParams.get("end")
    const type = searchParams.get("type")
    const filter = searchParams.get("filter") ?? "all" // mine | hr | all
    const vacancyId = searchParams.get("vacancyId")
    const candidateId = searchParams.get("candidateId")

    const conditions = [eq(calendarEvents.companyId, user.companyId)]

    if (vacancyId) {
      conditions.push(eq(calendarEvents.vacancyId, vacancyId))
    }
    if (candidateId) {
      conditions.push(eq(calendarEvents.candidateId, candidateId))
    }

    if (start) {
      conditions.push(gte(calendarEvents.startAt, new Date(start)))
    }
    if (end) {
      conditions.push(lte(calendarEvents.startAt, new Date(end)))
    }
    if (type) {
      conditions.push(eq(calendarEvents.type, type))
    }
    if (filter === "hr") {
      conditions.push(eq(calendarEvents.scope, "hr"))
    }
    if (filter === "mine") {
      // «Мой» = события, где я автор ИЛИ участник (а не только созданные мной).
      const myParticipantEvents = db
        .select({ eventId: calendarEventParticipants.eventId })
        .from(calendarEventParticipants)
        .where(eq(calendarEventParticipants.userId, user.id!))
      conditions.push(
        or(
          eq(calendarEvents.createdBy, user.id!),
          inArray(calendarEvents.id, myParticipantEvents),
        )!
      )
    }

    // Обогащаем события данными кандидата (скоринг/телефон/стадия/анкета) —
    // карточкам интервью нужно показывать контекст, а не только имя.
    // getTableColumns сохраняет плоскую форму события (обратная совместимость
    // с остальными потребителями /calendar), добавляя поля cand*.
    const rows = await db
      .select({
        ...getTableColumns(calendarEvents),
        candAiScore: candidates.aiScore,
        candResumeScore: candidates.resumeScore,
        candScore: candidates.score,
        candAnswersScore: candidates.demoAnswersScore,
        candPhone: candidates.phone,
        candStage: candidates.stage,
        candAnketa: candidates.anketaAnswers,
        // Обогащение карточки интервью: город, желаемая зарплата, прогресс демо,
        // источник — те же поля, что показывает карточка кандидата на канбане.
        candCity: candidates.city,
        candSalaryMin: candidates.salaryMin,
        candSalaryMax: candidates.salaryMax,
        candDemoProgressJson: candidates.demoProgressJson,
        candSource: candidates.source,
      })
      .from(calendarEvents)
      .leftJoin(candidates, eq(candidates.id, calendarEvents.candidateId))
      .where(and(...conditions))
      .orderBy(calendarEvents.startAt)

    // Последний результат теста по каждому кандидату (одним запросом).
    const candIds = Array.from(new Set(rows.map(r => r.candidateId).filter(Boolean))) as string[]
    const testMap = new Map<string, number | null>()
    if (candIds.length > 0) {
      const subs = await db
        .select({ candidateId: testSubmissions.candidateId, aiScore: testSubmissions.aiScore, submittedAt: testSubmissions.submittedAt })
        .from(testSubmissions)
        .where(inArray(testSubmissions.candidateId, candIds))
        .orderBy(desc(testSubmissions.submittedAt))
      for (const s of subs) if (!testMap.has(s.candidateId)) testMap.set(s.candidateId, s.aiScore)
    }

    const events = rows.map(r => {
      const anketaArr = Array.isArray(r.candAnketa) ? r.candAnketa : []
      return {
        ...r,
        candAnketaFilled: anketaArr.length > 0,
        candTested: r.candidateId ? testMap.has(r.candidateId) : false,
        candTestScore: r.candidateId ? (testMap.get(r.candidateId) ?? null) : null,
      }
    })

    return apiSuccess(events)
  } catch (err: unknown) {
    if (err instanceof Response) return err
    return apiError("Ошибка сервера", 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = await req.json()

    const { title, description, type, startAt, endAt, allDay, roomId, color, recurrence, participants,
            externalParticipants,
            candidateId, vacancyId, interviewer, interviewType, interviewFormat, interviewStatus, scope,
            location, meetingUrl } = body

    const cleanExternal = Array.isArray(externalParticipants)
      ? (externalParticipants as unknown[]).map(String).map(s => s.trim()).filter(Boolean)
      : []

    if (!title || !startAt || !endAt) {
      return apiError("Обязательные поля: title, startAt, endAt")
    }

    const [event] = await db
      .insert(calendarEvents)
      .values({
        companyId: user.companyId,
        title,
        description,
        type: type ?? "meeting",
        startAt: new Date(startAt),
        endAt: new Date(endAt),
        allDay: allDay ?? false,
        roomId: roomId ?? null,
        createdBy: user.id!,
        color,
        recurrence,
        status: "confirmed",
        candidateId:     candidateId ?? null,
        vacancyId:       vacancyId ?? null,
        interviewer:     interviewer ?? null,
        interviewType:   interviewType ?? null,
        interviewFormat: interviewFormat ?? null,
        interviewStatus: interviewStatus ?? null,
        location:    location ?? null,
        meetingUrl:  meetingUrl ?? null,
        scope: (scope === "hr" || scope === "personal") ? scope : "company",
        externalParticipants: cleanExternal,
      })
      .returning()

    if (participants && Array.isArray(participants) && participants.length > 0) {
      await db.insert(calendarEventParticipants).values(
        participants.map((userId: string) => ({
          eventId: event.id,
          userId,
          status: "pending",
        }))
      )
    }

    return apiSuccess(event, 201)
  } catch (err: unknown) {
    if (err instanceof Response) return err
    return apiError("Ошибка сервера", 500)
  }
}
