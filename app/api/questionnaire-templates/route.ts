import { NextRequest } from "next/server"
import { eq, or, and, isNull, isNotNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { questionnaireTemplates } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

const VALID_TYPES = ["candidate", "client", "post_demo"] as const

// GET /api/questionnaire-templates — системные + шаблоны компании.
// ?trashed=true → только корзина (deleted_at IS NOT NULL); иначе активные.
export async function GET(req: NextRequest) {
  try {
    const user = await requireCompany()
    const trashed = req.nextUrl.searchParams.get("trashed") === "true"

    const rows = await db
      .select()
      .from(questionnaireTemplates)
      .where(
        and(
          or(
            eq(questionnaireTemplates.isSystem, true),
            eq(questionnaireTemplates.tenantId, user.companyId),
          ),
          // Системные не удаляются → в корзине только tenant-шаблоны.
          trashed ? isNotNull(questionnaireTemplates.deletedAt) : isNull(questionnaireTemplates.deletedAt),
        ),
      )
      .orderBy(questionnaireTemplates.createdAt)

    return apiSuccess(rows)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[questionnaire-templates GET]", err)
    return apiError("Внутренняя ошибка", 500)
  }
}

// POST /api/questionnaire-templates — создать шаблон компании.
export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = await req.json() as {
      name: string
      type?: string
      questions?: unknown
    }

    if (!body.name?.trim()) return apiError("Название обязательно", 400)
    const safeName = body.name.trim().substring(0, 120)
    const type = VALID_TYPES.includes(body.type as typeof VALID_TYPES[number]) ? body.type! : "candidate"
    const questions = Array.isArray(body.questions) ? body.questions : []

    const [created] = await db
      .insert(questionnaireTemplates)
      .values({
        tenantId: user.companyId,
        name: safeName,
        type,
        questions,
        isSystem: false,
      })
      .returning()

    return apiSuccess(created, 201)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[questionnaire-templates POST]", err)
    return apiError("Внутренняя ошибка", 500)
  }
}
