// GET / PUT /api/modules/hr/vacancies/[id]/reference-check
// Конфиг блока «Реф-чек» (Группа 19).
// Хранится в vacancies.descriptionJson.referenceCheck.

import { NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

export { PUT as PATCH }

export interface ReferenceCheckConfig {
  questions: string[]
  required:  boolean
}

const MAX_QUESTIONS    = 20
const MAX_QUESTION_LEN = 500

function sanitizeQuestions(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  const out: string[] = []
  for (const q of v) {
    if (typeof q !== "string") continue
    const trimmed = q.trim().slice(0, MAX_QUESTION_LEN)
    if (trimmed.length === 0) continue
    out.push(trimmed)
    if (out.length >= MAX_QUESTIONS) break
  }
  return out
}

function readConfig(dj: unknown): ReferenceCheckConfig | null {
  if (!dj || typeof dj !== "object") return null
  const rc = (dj as Record<string, unknown>).referenceCheck
  if (!rc || typeof rc !== "object") return null
  const obj = rc as Record<string, unknown>
  return {
    questions: sanitizeQuestions(obj.questions),
    required:  obj.required === true,
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params
    const [row] = await db
      .select({ descriptionJson: vacancies.descriptionJson })
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)
    if (!row) return apiError("Vacancy not found", 404)
    return apiSuccess({ config: readConfig(row.descriptionJson) })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params
    const body = await req.json().catch(() => ({})) as Partial<ReferenceCheckConfig>

    const [existing] = await db
      .select({ descriptionJson: vacancies.descriptionJson })
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)
    if (!existing) return apiError("Vacancy not found", 404)

    const currentJson = (existing.descriptionJson && typeof existing.descriptionJson === "object" && existing.descriptionJson !== null)
      ? existing.descriptionJson as Record<string, unknown>
      : {}

    const nextConfig: ReferenceCheckConfig = {
      questions: sanitizeQuestions(body.questions),
      required:  body.required === true,
    }

    const nextJson = { ...currentJson, referenceCheck: nextConfig }

    await db
      .update(vacancies)
      .set({ descriptionJson: nextJson, updatedAt: new Date() })
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))

    return apiSuccess({ ok: true, config: nextConfig })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
