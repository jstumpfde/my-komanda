import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { demos, vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// Verify demo exists and belongs to the user's company
async function getOwnedDemo(demoId: string, companyId: string) {
  const [row] = await db
    .select({
      id: demos.id,
      vacancyId: demos.vacancyId,
      title: demos.title,
      status: demos.status,
      lessonsJson: demos.lessonsJson,
      createdAt: demos.createdAt,
      updatedAt: demos.updatedAt,
    })
    .from(demos)
    .innerJoin(vacancies, eq(demos.vacancyId, vacancies.id))
    .where(and(eq(demos.id, demoId), eq(vacancies.companyId, companyId)))
    .limit(1)

  return row ?? null
}

// GET /api/demos/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const demo = await getOwnedDemo(id, user.companyId)
    if (!demo) return apiError("Демо не найдено", 404)

    return apiSuccess(demo)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[demos/[id] GET] error:", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}

// PUT /api/demos/[id] — обновить { title?, status?, lessons_json? }
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const existing = await getOwnedDemo(id, user.companyId)
    if (!existing) return apiError("Демо не найдено", 404)

    const body = await req.json() as {
      title?: unknown
      status?: unknown
      lessons_json?: unknown
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: Record<string, any> = { updatedAt: new Date() }

    if (typeof body.title === "string" && body.title.trim()) {
      updates.title = body.title.trim()
    }
    if (typeof body.status === "string" && ["draft", "published"].includes(body.status)) {
      updates.status = body.status
    }
    if (Array.isArray(body.lessons_json)) {
      updates.lessonsJson = body.lessons_json
    }

    const [updated] = await db
      .update(demos)
      .set(updates)
      .where(eq(demos.id, id))
      .returning()

    return apiSuccess(updated)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[demos/[id] PUT] error:", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}

// DELETE /api/demos/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const existing = await getOwnedDemo(id, user.companyId)
    if (!existing) return apiError("Демо не найдено", 404)

    await db.delete(demos).where(eq(demos.id, id))

    return apiSuccess({ success: true })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[demos/[id] DELETE] error:", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
