// GET /api/partner/products — список продуктов (модулей), которые партнёр может
// подключить клиенту при онбординге.
import { asc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { modules } from "@/lib/db/schema"
import { requirePartner } from "@/lib/partner/access"
import { apiError, apiSuccess } from "@/lib/api-helpers"

export async function GET() {
  try {
    await requirePartner()
    const products = await db
      .select({ slug: modules.slug, name: modules.name })
      .from(modules)
      .where(eq(modules.isActive, true))
      .orderBy(asc(modules.sortOrder))
    return apiSuccess({ products })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[partner/products]", err instanceof Error ? err.message : err)
    return apiError("Internal server error", 500)
  }
}
