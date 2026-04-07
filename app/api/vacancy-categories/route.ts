import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { customVacancyCategories } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { POSITION_CATEGORIES } from "@/lib/position-classifier"

const systemCategories = Object.entries(POSITION_CATEGORIES).map(([key, val]) => ({
  value: key,
  label: val.label,
}))

export async function GET() {
  try {
    const user = await requireCompany()

    const custom = await db
      .select({ id: customVacancyCategories.id, name: customVacancyCategories.name })
      .from(customVacancyCategories)
      .where(eq(customVacancyCategories.companyId, user.companyId))
      .orderBy(customVacancyCategories.name)

    return apiSuccess({ system: systemCategories, custom })
  } catch (e) {
    if (e instanceof Response || (e && typeof e === "object" && "status" in e)) throw e
    return apiError("Ошибка загрузки категорий", 500)
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireCompany()
    const body = await req.json() as { name?: string }
    const name = (body.name || "").trim()

    if (!name) return apiError("Название обязательно")
    if (name.length > 100) return apiError("Максимум 100 символов")

    const [created] = await db
      .insert(customVacancyCategories)
      .values({ companyId: user.companyId, name })
      .returning({ id: customVacancyCategories.id, name: customVacancyCategories.name })

    return apiSuccess(created, 201)
  } catch (e: unknown) {
    if (e instanceof Response || (e && typeof e === "object" && "status" in e)) throw e
    if (e instanceof Error && e.message.includes("unique")) {
      return apiError("Такая категория уже существует", 409)
    }
    return apiError("Ошибка создания категории", 500)
  }
}
