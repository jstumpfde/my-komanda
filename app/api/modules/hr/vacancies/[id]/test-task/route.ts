// GET / PUT /api/modules/hr/vacancies/[id]/test-task
// Конфиг блока «Тестовое задание» (#79 Группа 19).
// Хранится в vacancies.descriptionJson.testTask.

import { NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

export { PUT as PATCH }

export interface TestTaskConfig {
  taskText:        string
  deadlineDays:    number
  aiCheck:         boolean
  responseFormat:  "text" | "file" | "both"
}

const MAX_TEXT  = 5000
const MIN_DAYS  = 1
const MAX_DAYS  = 30

function clampDays(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v)
  if (!Number.isFinite(n)) return 3
  return Math.min(MAX_DAYS, Math.max(MIN_DAYS, Math.round(n)))
}

function sanitizeText(v: unknown): string {
  return typeof v === "string" ? v.slice(0, MAX_TEXT) : ""
}

function readConfig(dj: unknown): TestTaskConfig | null {
  if (!dj || typeof dj !== "object") return null
  const tt = (dj as Record<string, unknown>).testTask
  if (!tt || typeof tt !== "object") return null
  const obj = tt as Record<string, unknown>
  return {
    taskText:       typeof obj.taskText === "string" ? obj.taskText : "",
    deadlineDays:   typeof obj.deadlineDays === "number" ? obj.deadlineDays : 3,
    aiCheck:        obj.aiCheck === true,
    responseFormat: obj.responseFormat === "file" || obj.responseFormat === "both"
                      ? obj.responseFormat
                      : "text",
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
    const body = await req.json().catch(() => ({})) as Partial<TestTaskConfig>

    const [existing] = await db
      .select({ descriptionJson: vacancies.descriptionJson })
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)
    if (!existing) return apiError("Vacancy not found", 404)

    const currentJson = (existing.descriptionJson && typeof existing.descriptionJson === "object" && existing.descriptionJson !== null)
      ? existing.descriptionJson as Record<string, unknown>
      : {}

    const nextTestTask: TestTaskConfig = {
      taskText:       sanitizeText(body.taskText),
      deadlineDays:   clampDays(body.deadlineDays),
      aiCheck:        body.aiCheck === true,
      responseFormat: body.responseFormat === "file" || body.responseFormat === "both"
                        ? body.responseFormat
                        : "text",
    }

    const nextJson = { ...currentJson, testTask: nextTestTask }

    await db
      .update(vacancies)
      .set({ descriptionJson: nextJson, updatedAt: new Date() })
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))

    return apiSuccess({ ok: true, config: nextTestTask })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
