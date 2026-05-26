import { NextRequest } from "next/server"
import {eq, or, and, isNull, isNotNull} from "drizzle-orm"
import { db } from "@/lib/db"
import { demoTemplates } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// GET /api/demo-templates — system + tenant templates
// ?trashed=true → только в корзине (deleted_at IS NOT NULL); иначе активные.
export async function GET(req: NextRequest) {
  try {
    const user = await requireCompany()
    const trashed = req.nextUrl.searchParams.get("trashed") === "true"

    const rows = await db
      .select()
      .from(demoTemplates)
      .where(
        and(
          or(
            eq(demoTemplates.isSystem, true),
            eq(demoTemplates.tenantId, user.companyId),
          ),
          // Этап 3: системные не удаляются → в корзине только tenant-шаблоны.
          trashed ? isNotNull(demoTemplates.deletedAt) : isNull(demoTemplates.deletedAt),
        ),
      )
      .orderBy(demoTemplates.createdAt)

    return apiSuccess(rows)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[demo-templates GET]", err)
    return apiError("Внутренняя ошибка", 500)
  }
}

// POST /api/demo-templates — create tenant template
export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = await req.json() as {
      name: string
      niche: string
      length: string
      sections: unknown
      audience?: string[]
      reviewCycle?: string
      validUntil?: string | null
    }

    if (!body.name?.trim()) return apiError("Название обязательно", 400)
    const safeName = body.name.trim().substring(0, 76)

    const audience = Array.isArray(body.audience) && body.audience.length > 0
      ? body.audience.filter((v): v is string => typeof v === "string")
      : ["candidates"]

    const reviewCycle = typeof body.reviewCycle === "string" && body.reviewCycle ? body.reviewCycle : "none"
    const validUntil = body.validUntil && !isNaN(Date.parse(body.validUntil)) ? new Date(body.validUntil) : null

    const [created] = await db
      .insert(demoTemplates)
      .values({
        tenantId: user.companyId,
        name: safeName,
        niche: body.niche || "universal",
        length: body.length || "standard",
        isSystem: false,
        sections: body.sections ?? [],
        audience,
        reviewCycle,
        validUntil,
      })
      .returning()

    return apiSuccess(created, 201)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[demo-templates POST]", err)
    return apiError("Внутренняя ошибка", 500)
  }
}
