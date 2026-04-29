import { NextRequest } from "next/server"
import { eq, and, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies, hhResponses, hhCandidates, demos } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// Helper: verify candidate belongs to user's company
async function getOwnedCandidate(candidateId: string, companyId: string) {
  const [row] = await db
    .select({
      candidate: candidates,
      vacancyTitle: vacancies.title,
      hhResponseId: hhResponses.hhResponseId,
      hhRawData: hhResponses.rawData,
    })
    .from(candidates)
    .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
    .leftJoin(
      hhResponses,
      and(eq(hhResponses.localCandidateId, candidates.id), eq(hhResponses.companyId, companyId))
    )
    .where(and(eq(candidates.id, candidateId), eq(vacancies.companyId, companyId)))
    .limit(1)

  if (!row) return null

  // Fallback: hh_responses может быть не привязан напрямую к candidate (старый
  // импорт через lib/hh/client). Доходим через hh_candidates.hhApplicationId.
  if (!row.hhResponseId) {
    const [link] = await db
      .select({ hhApplicationId: hhCandidates.hhApplicationId })
      .from(hhCandidates)
      .where(eq(hhCandidates.candidateId, candidateId))
      .limit(1)
    if (link?.hhApplicationId) {
      const [resp] = await db
        .select({
          hhResponseId: hhResponses.hhResponseId,
          rawData: hhResponses.rawData,
        })
        .from(hhResponses)
        .where(and(
          eq(hhResponses.companyId, companyId),
          eq(hhResponses.hhResponseId, link.hhApplicationId),
        ))
        .limit(1)
      if (resp) {
        return { ...row, hhResponseId: resp.hhResponseId, hhRawData: resp.rawData }
      }
    }
  }

  return row
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const row = await getOwnedCandidate(id, user.companyId)
    if (!row) {
      return apiError("Candidate not found", 404)
    }

    // Latest demo lessons for the candidate's vacancy — used to render question
    // text on the "Ответы" tab.
    const [demoRow] = await db
      .select({ lessonsJson: demos.lessonsJson })
      .from(demos)
      .where(eq(demos.vacancyId, row.candidate.vacancyId))
      .orderBy(desc(demos.updatedAt))
      .limit(1)

    return apiSuccess({
      ...row.candidate,
      vacancyTitle: row.vacancyTitle,
      hhResponseId: row.hhResponseId ?? null,
      hhRawData: row.hhRawData ?? null,
      demoLessons: demoRow?.lessonsJson ?? null,
    })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const existingRow = await getOwnedCandidate(id, user.companyId)
    if (!existingRow) {
      return apiError("Candidate not found", 404)
    }

    const body = await req.json() as {
      stage?: string
      score?: number
      name?: string
      phone?: string
      email?: string
    }

    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    }

    if (body.stage !== undefined) updates.stage = body.stage
    if (body.score !== undefined) updates.score = body.score
    if (body.name !== undefined) updates.name = body.name
    if (body.phone !== undefined) updates.phone = body.phone
    if (body.email !== undefined) updates.email = body.email

    const [updated] = await db
      .update(candidates)
      .set(updates)
      .where(eq(candidates.id, id))
      .returning()

    return apiSuccess(updated)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
