import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

export interface CandidateNote {
  text: string
  createdAt: string
  authorId?: string
}

// Helper: verify candidate belongs to user's company
async function getOwnedCandidate(candidateId: string, companyId: string) {
  const [row] = await db
    .select({ candidate: candidates })
    .from(candidates)
    .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
    .where(and(eq(candidates.id, candidateId), eq(vacancies.companyId, companyId)))
    .limit(1)
  return row?.candidate ?? null
}

function extractNotes(demoProgressJson: unknown): CandidateNote[] {
  if (!demoProgressJson || typeof demoProgressJson !== "object") return []
  const json = demoProgressJson as Record<string, unknown>
  if (!Array.isArray(json.notes)) return []
  return json.notes as CandidateNote[]
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const candidate = await getOwnedCandidate(id, user.companyId)
    if (!candidate) {
      return apiError("Candidate not found", 404)
    }

    const notes = extractNotes(candidate.demoProgressJson)
    return apiSuccess(notes)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const candidate = await getOwnedCandidate(id, user.companyId)
    if (!candidate) {
      return apiError("Candidate not found", 404)
    }

    const body = await req.json() as { text?: unknown }
    const text = typeof body.text === "string" ? body.text.trim() : ""
    if (!text) {
      return apiError("text is required", 400)
    }

    const newNote: CandidateNote = {
      text,
      createdAt: new Date().toISOString(),
      authorId: user.id,
    }

    const existingJson = (candidate.demoProgressJson && typeof candidate.demoProgressJson === "object")
      ? (candidate.demoProgressJson as Record<string, unknown>)
      : {}

    const existingNotes = Array.isArray(existingJson.notes)
      ? (existingJson.notes as CandidateNote[])
      : []

    const updatedJson = {
      ...existingJson,
      notes: [...existingNotes, newNote],
    }

    await db
      .update(candidates)
      .set({ demoProgressJson: updatedJson, updatedAt: new Date() })
      .where(eq(candidates.id, id))

    return apiSuccess(newNote, 201)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
