import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { customSkills } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

const VALID_TYPES = ["skill", "condition", "stop_factor", "parameter"] as const
type ItemType = typeof VALID_TYPES[number]

export async function GET(req: Request) {
  try {
    const user = await requireCompany()
    const url = new URL(req.url)
    const type = url.searchParams.get("type") as ItemType | null

    if (type && !VALID_TYPES.includes(type)) {
      return apiError("Неверный тип", 400)
    }

    const conditions = type
      ? and(eq(customSkills.companyId, user.companyId), eq(customSkills.type, type))
      : eq(customSkills.companyId, user.companyId)

    const items = await db
      .select({ id: customSkills.id, name: customSkills.name, type: customSkills.type })
      .from(customSkills)
      .where(conditions)
      .orderBy(customSkills.name)

    return apiSuccess({ items })
  } catch (e) {
    if (e instanceof Response || (e && typeof e === "object" && "status" in e)) throw e
    console.error("[custom-items GET]", e)
    return apiError("Ошибка загрузки", 500)
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireCompany()
    const body = await req.json() as { name?: string; type?: string }
    const name = (body.name || "").trim()
    const type = body.type as ItemType

    if (!name) return apiError("Название обязательно")
    if (name.length > 100) return apiError("Максимум 100 символов")
    if (!type || !VALID_TYPES.includes(type)) return apiError("Неверный тип")

    const [created] = await db
      .insert(customSkills)
      .values({ companyId: user.companyId, name, type })
      .returning({ id: customSkills.id, name: customSkills.name, type: customSkills.type })

    return apiSuccess(created, 201)
  } catch (e: unknown) {
    if (e instanceof Response || (e && typeof e === "object" && "status" in e)) throw e
    if (e instanceof Error && e.message.includes("unique")) {
      return apiError("Такой элемент уже существует", 409)
    }
    return apiError("Ошибка создания", 500)
  }
}
