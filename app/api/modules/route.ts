import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { modules } from "@/lib/db/schema"
import { apiError, apiSuccess } from "@/lib/api-helpers"

// GET /api/modules — все активные модули платформы (публичный)
export async function GET() {
  try {
    const rows = await db
      .select()
      .from(modules)
      .where(eq(modules.isActive, true))
      .orderBy(modules.sortOrder)

    return apiSuccess(rows)
  } catch (err) {
    console.error("[api/modules GET]", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
