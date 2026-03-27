import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { demos, vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// GET /api/demos?vacancy_id=... — получить демо для вакансии
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

    const rows = await db
      .select()
      .from(demos)
      .where(eq(demos.vacancyId, vacancyId))

    return apiSuccess(rows)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[demos GET] error:", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}

// POST /api/demos — создать демо
export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = await req.json() as {
      vacancy_id?: unknown
      title?: unknown
      lessons_json?: unknown
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

    const lessonsJson = Array.isArray(body.lessons_json) ? body.lessons_json : []

    const [demo] = await db
      .insert(demos)
      .values({ vacancyId, title, lessonsJson })
      .returning()

    return apiSuccess(demo, 201)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[demos POST] error:", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
