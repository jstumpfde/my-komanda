import { NextRequest } from "next/server"
import { eq, or, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { demoTemplates } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// GET /api/demo-templates — system + tenant templates
export async function GET() {
  try {
    const user = await requireCompany()

    const rows = await db
      .select()
      .from(demoTemplates)
      .where(
        or(
          eq(demoTemplates.isSystem, true),
          eq(demoTemplates.tenantId, user.companyId),
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
    }

    if (!body.name?.trim()) return apiError("Название обязательно", 400)

    const [created] = await db
      .insert(demoTemplates)
      .values({
        tenantId: user.companyId,
        name: body.name.trim(),
        niche: body.niche || "universal",
        length: body.length || "standard",
        isSystem: false,
        sections: body.sections ?? [],
      })
      .returning()

    return apiSuccess(created, 201)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[demo-templates POST]", err)
    return apiError("Внутренняя ошибка", 500)
  }
}
