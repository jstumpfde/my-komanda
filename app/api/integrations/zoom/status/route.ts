import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { userVideoIntegrations } from "@/lib/db/schema"
import { requireAuth, apiError, apiSuccess } from "@/lib/api-helpers"

export async function GET() {
  try {
    const user = await requireAuth()
    const [row] = await db
      .select({ email: userVideoIntegrations.externalAccountEmail })
      .from(userVideoIntegrations)
      .where(and(
        eq(userVideoIntegrations.userId, user.id),
        eq(userVideoIntegrations.provider, "zoom"),
        eq(userVideoIntegrations.isActive, true),
      ))
      .limit(1)

    return apiSuccess({ connected: !!row, email: row?.email ?? null })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
