// GET /api/integrations/yandex-disk/status — есть ли у компании подключённый
// Яндекс.Диск (используется мелкими виджетами; полный список источников со
// всеми провайдерами — GET /api/modules/knowledge/sources).

import { apiError, apiSuccess, requireCompany } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { knowledgeSources } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"

export async function GET() {
  try {
    const user = await requireCompany()
    const [row] = await db
      .select({
        id: knowledgeSources.id,
        title: knowledgeSources.title,
        status: knowledgeSources.status,
        lastSyncAt: knowledgeSources.lastSyncAt,
        lastError: knowledgeSources.lastError,
      })
      .from(knowledgeSources)
      .where(and(
        eq(knowledgeSources.tenantId, user.companyId),
        eq(knowledgeSources.provider, "yandex_disk"),
      ))
      .limit(1)

    return apiSuccess({ connected: Boolean(row), source: row ?? null })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[yandex-disk/status]", err)
    return apiError("Internal server error", 500)
  }
}
