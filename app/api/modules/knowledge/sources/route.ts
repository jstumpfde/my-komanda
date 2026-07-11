// GET  /api/modules/knowledge/sources — список подключённых источников компании
//      (гейт фиче-флага — см. lib/knowledge-sources/feature-flag.ts).
// POST /api/modules/knowledge/sources — вернуть URL для запуска OAuth-подключения
//      нового провайдера (сама привязка происходит на GET /api/integrations/
//      {provider}/auth — редирект-роут, не JSON-эндпоинт).

import { auth } from "@/auth"
import { apiError, apiSuccess, requireCompany, requireDirector } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { knowledgeSources } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { isKnowledgeDriveSourcesEnabled } from "@/lib/knowledge-sources/feature-flag"

const CONNECT_URLS: Record<string, string> = {
  yandex_disk: "/api/integrations/yandex-disk/auth",
}

export async function GET() {
  try {
    const user = await requireCompany()
    const session = await auth()
    const enabled = await isKnowledgeDriveSourcesEnabled(user.companyId, session?.user?.email)
    if (!enabled) {
      return apiSuccess({ enabled: false, sources: [] })
    }

    const rows = await db
      .select({
        id: knowledgeSources.id,
        provider: knowledgeSources.provider,
        title: knowledgeSources.title,
        status: knowledgeSources.status,
        rootFolders: knowledgeSources.rootFolders,
        lastSyncAt: knowledgeSources.lastSyncAt,
        lastFullCrawlAt: knowledgeSources.lastFullCrawlAt,
        lastError: knowledgeSources.lastError,
        createdAt: knowledgeSources.createdAt,
      })
      .from(knowledgeSources)
      .where(eq(knowledgeSources.tenantId, user.companyId))

    return apiSuccess({ enabled: true, sources: rows })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[knowledge/sources GET]", err)
    return apiError("Internal server error", 500)
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireDirector()
    const session = await auth()
    const enabled = await isKnowledgeDriveSourcesEnabled(user.companyId, session?.user?.email)
    if (!enabled) return apiError("«Подключённые источники» пока недоступны для вашей компании", 403)

    const body = await req.json().catch(() => ({})) as { provider?: string }
    const provider = body.provider
    if (!provider || !CONNECT_URLS[provider]) {
      return apiError("Провайдер не поддерживается в фазе 1 (доступен только yandex_disk)", 400)
    }

    return apiSuccess({ authUrl: CONNECT_URLS[provider] })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[knowledge/sources POST]", err)
    return apiError("Internal server error", 500)
  }
}
