import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { userVideoIntegrations } from "@/lib/db/schema"
import { requireAuth, apiError, apiSuccess } from "@/lib/api-helpers"
import { revokeToken } from "@/lib/zoom/oauth"

export async function POST() {
  try {
    const user = await requireAuth()
    const [row] = await db
      .select({ accessToken: userVideoIntegrations.accessToken })
      .from(userVideoIntegrations)
      .where(and(eq(userVideoIntegrations.userId, user.id), eq(userVideoIntegrations.provider, "zoom")))
      .limit(1)

    if (row) {
      await revokeToken(row.accessToken)
      await db
        .delete(userVideoIntegrations)
        .where(and(eq(userVideoIntegrations.userId, user.id), eq(userVideoIntegrations.provider, "zoom")))
    }

    return apiSuccess({ disconnected: true })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
