import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies, hhResponses } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// Helper: verify candidate belongs to user's company
async function getOwnedCandidate(candidateId: string, companyId: string) {
  const [row] = await db
    .select({
      candidate: candidates,
      vacancyTitle: vacancies.title,
      hhResponseId: hhResponses.hhResponseId,
    })
    .from(candidates)
    .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
    .leftJoin(
      hhResponses,
      and(eq(hhResponses.localCandidateId, candidates.id), eq(hhResponses.companyId, companyId))
    )
    .where(and(eq(candidates.id, candidateId), eq(vacancies.companyId, companyId)))
    .limit(1)

  return row ?? null
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

    return apiSuccess({ ...row.candidate, vacancyTitle: row.vacancyTitle, hhResponseId: row.hhResponseId ?? null })
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
