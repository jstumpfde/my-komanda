import { NextRequest } from "next/server"
import { eq, and, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidateContacts, candidates, vacancies, users } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// GET — лог контактов кандидата (звонки/видео/встречи)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    // Проверка принадлежности кандидата компании.
    const [own] = await db
      .select({ id: candidates.id })
      .from(candidates)
      .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
      .where(and(eq(candidates.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)
    if (!own) return apiError("Candidate not found", 404)

    const rows = await db
      .select({
        id: candidateContacts.id,
        channel: candidateContacts.channel,
        outcome: candidateContacts.outcome,
        reasonCategory: candidateContacts.reasonCategory,
        comment: candidateContacts.comment,
        createdAt: candidateContacts.createdAt,
        createdByName: users.name,
      })
      .from(candidateContacts)
      .leftJoin(users, eq(candidateContacts.createdById, users.id))
      .where(eq(candidateContacts.candidateId, id))
      .orderBy(desc(candidateContacts.createdAt))
    return apiSuccess({ contacts: rows })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

// POST — записать контакт: { channel, outcome, reasonCategory?, comment? }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params
    const body = await req.json() as {
      channel?: string
      outcome?: string
      reasonCategory?: string | null
      comment?: string | null
    }

    // Кандидат + его вакансия (для денорм. vacancyId в отчёте).
    const [cand] = await db
      .select({ id: candidates.id, vacancyId: candidates.vacancyId })
      .from(candidates)
      .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
      .where(and(eq(candidates.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)
    if (!cand) return apiError("Candidate not found", 404)

    const [created] = await db
      .insert(candidateContacts)
      .values({
        tenantId: user.companyId,
        candidateId: id,
        vacancyId: cand.vacancyId ?? null,
        channel: ["call", "video", "meeting", "message"].includes(body.channel ?? "") ? body.channel : "call",
        outcome: ["fit", "no_fit", "pending"].includes(body.outcome ?? "") ? body.outcome : "pending",
        reasonCategory: body.outcome === "no_fit" ? (body.reasonCategory ?? null) : null,
        comment: body.comment || null,
        createdById: user.id ?? null,
      })
      .returning()
    return apiSuccess(created, 201)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
