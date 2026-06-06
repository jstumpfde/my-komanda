import { NextRequest } from "next/server"
import { eq, and, max } from "drizzle-orm"
import { db } from "@/lib/db"
import { demos, vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// GET /api/demos?vacancy_id=...
// - Без ?list=1: возвращает строки с указанным ?kind= (по умолч. 'demo') — обратная совместимость.
// - С ?list=1: возвращает ВСЕ строки вакансии, отсортированные по sort_order, затем created_at.
export async function GET(req: NextRequest) {
  try {
    const user = await requireCompany()
    const vacancyId = req.nextUrl.searchParams.get("vacancy_id")
    if (!vacancyId) return apiError("'vacancy_id' обязателен", 400)

    // Verify vacancy belongs to this company
    const [vacancy] = await db
      .select({ id: vacancies.id })
      .from(vacancies)
      .where(and(eq(vacancies.id, vacancyId), eq(vacancies.companyId, user.companyId)))
      .limit(1)

    if (!vacancy) return apiError("Вакансия не найдена", 404)

    const listMode = req.nextUrl.searchParams.get("list") === "1"

    if (listMode) {
      // Возвращаем все блоки вакансии, упорядоченные по sort_order, затем created_at
      const rows = await db
        .select()
        .from(demos)
        .where(eq(demos.vacancyId, vacancyId))
        .orderBy(demos.sortOrder, demos.createdAt)

      return apiSuccess(rows)
    }

    // Обратная совместимость: ?kind=demo|test (default 'demo').
    const kind = req.nextUrl.searchParams.get("kind") === "test" ? "test" : "demo"

    const rows = await db
      .select()
      .from(demos)
      .where(and(eq(demos.vacancyId, vacancyId), eq(demos.kind, kind)))

    return apiSuccess(rows)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[demos GET] error:", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}

// POST /api/demos — создать демо или динамический блок контента
export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = await req.json() as {
      vacancy_id?: unknown
      title?: unknown
      lessons_json?: unknown
      kind?: unknown
      content_type?: unknown
    }

    const vacancyId = typeof body.vacancy_id === "string" ? body.vacancy_id : null
    if (!vacancyId) return apiError("'vacancy_id' обязателен", 400)

    const title = typeof body.title === "string" ? body.title.trim() : ""
    if (!title) return apiError("'title' обязателен", 400)

    // Verify vacancy belongs to this company
    const [vacancy] = await db
      .select({ id: vacancies.id })
      .from(vacancies)
      .where(and(eq(vacancies.id, vacancyId), eq(vacancies.companyId, user.companyId)))
      .limit(1)

    if (!vacancy) return apiError("Вакансия не найдена", 404)

    // Определяем kind:
    // - Явно переданный 'demo' или 'test' → берём как есть (обратная совместимость).
    // - Иначе (новый динамический блок) → генерируем 'block:<uuid>'.
    let kind: string
    if (body.kind === "demo" || body.kind === "test") {
      kind = body.kind as string
    } else if (typeof body.kind === "string" && body.kind.startsWith("block:")) {
      kind = body.kind
    } else {
      const { randomUUID } = await import("crypto")
      kind = `block:${randomUUID()}`
    }

    // content_type: 'presentation' | 'test' | 'task', по умолч. 'presentation'
    const CONTENT_TYPES = ["presentation", "test", "task"]
    const contentType = typeof body.content_type === "string" && CONTENT_TYPES.includes(body.content_type)
      ? body.content_type
      : "presentation"

    const lessonsJson = Array.isArray(body.lessons_json) ? body.lessons_json : []

    // sort_order = (max sort_order по вакансии) + 1
    const [{ maxOrder }] = await db
      .select({ maxOrder: max(demos.sortOrder) })
      .from(demos)
      .where(eq(demos.vacancyId, vacancyId))

    const sortOrder = (maxOrder ?? -1) + 1

    const [demo] = await db
      .insert(demos)
      .values({ vacancyId, title, lessonsJson, kind, contentType, sortOrder })
      .returning()

    return apiSuccess(demo, 201)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[demos POST] error:", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
