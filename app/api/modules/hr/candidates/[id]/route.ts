import { NextRequest } from "next/server"
import { eq, and, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies, hhResponses, hhCandidates, demos } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { deriveCandidateName } from "@/lib/candidate-name"
import { describeSecondDemoInvite } from "@/lib/messaging/second-demo-invite"

// Helper: verify candidate belongs to user's company.
// За один SQL-запрос подтягиваем кандидата + вакансию + связку hh_responses
// (если есть) + ВСЕ lessons_json демо этой вакансии (kind='demo' И kind LIKE 'block:%')
// в виде JSON-массива — объединяет все блоки, чтобы blk-... ids резолвились.
async function getOwnedCandidate(candidateId: string, companyId: string) {
  const [row] = await db
    .select({
      candidate: candidates,
      vacancyTitle: vacancies.title,
      hhResponseId: hhResponses.hhResponseId,
      hhRawData: hhResponses.rawData,
      hhCandidateName: hhResponses.candidateName,
      // Возвращаем JSON-массив lessons_json всех демо вакансии (kind='demo' и
      // kind LIKE 'block:%'), чтобы answers-tab мог резолвить любой blk-... id.
      // Коррелированный subquery, один round-trip.
      demoLessons: sql<unknown>`(
        SELECT json_agg(
          json_build_object('id', ${demos.id}, 'title', ${demos.title}, 'lessons', ${demos.lessonsJson})
          ORDER BY ${demos.sortOrder}, ${demos.createdAt}
        )
        FROM ${demos}
        WHERE ${demos.vacancyId} = ${candidates.vacancyId}
          AND (${demos.kind} = 'demo' OR ${demos.kind} LIKE 'block:%')
      )`,
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
          candidateName: hhResponses.candidateName,
        })
        .from(hhResponses)
        .where(and(
          eq(hhResponses.companyId, companyId),
          eq(hhResponses.hhResponseId, link.hhApplicationId),
        ))
        .limit(1)
      if (resp) {
        return { ...row, hhResponseId: resp.hhResponseId, hhRawData: resp.rawData, hhCandidateName: resp.candidateName }
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

    // Прозрачность приглашения на 2-ю часть демо: показываем HR балл + порог +
    // приглашён/нет (read-only, не пишет в БД). null = фича в Портрете выключена.
    const secondDemoInvite = await describeSecondDemoInvite(id, row.candidate.vacancyId)

    return apiSuccess({
      ...row.candidate,
      // Имя: fallback на anketa_answers, затем на hh_responses.candidate_name
      name: deriveCandidateName(row.candidate.name, row.candidate.anketaAnswers, row.hhCandidateName ?? null),
      vacancyTitle: row.vacancyTitle,
      hhResponseId: row.hhResponseId ?? null,
      hhRawData: row.hhRawData ?? null,
      demoLessons: row.demoLessons ?? null,
      secondDemoInvite,
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
