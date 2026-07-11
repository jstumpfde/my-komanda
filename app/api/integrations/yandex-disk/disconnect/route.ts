// POST /api/integrations/yandex-disk/disconnect — отключить Яндекс.Диск
// компании (директор). Тонкая обёртка над disconnectKnowledgeSource —
// каноничный путь удаления любого источника (включая будущие провайдеры) —
// app/api/modules/knowledge/sources/[id]/route.ts (DELETE).

import { apiError, apiSuccess, requireDirector } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { knowledgeSources } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { disconnectKnowledgeSource } from "@/lib/knowledge-sources/disconnect"

export async function POST() {
  try {
    const user = await requireDirector()
    const [row] = await db
      .select({ id: knowledgeSources.id })
      .from(knowledgeSources)
      .where(and(
        eq(knowledgeSources.tenantId, user.companyId),
        eq(knowledgeSources.provider, "yandex_disk"),
      ))
      .limit(1)

    if (!row) return apiSuccess({ ok: true, disconnected: false })

    const disconnected = await disconnectKnowledgeSource(row.id, user.companyId)
    return apiSuccess({ ok: true, disconnected })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[yandex-disk/disconnect]", err)
    return apiError("Internal server error", 500)
  }
}
