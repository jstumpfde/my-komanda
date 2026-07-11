// POST /api/modules/knowledge/sources/[id]/sync — «Синхронизировать сейчас»
// (директор). Тот же движок, что и cron/knowledge-drive-sync
// (lib/knowledge-sources/sync-source.ts), но на один источник и с меньшим
// бюджетом файлов за вызов — это синхронный HTTP-запрос, не хотим держать
// его открытым бесконечно на большом первом краwlе.

import { NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { apiError, apiSuccess, requireDirector } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { knowledgeSources } from "@/lib/db/schema"
import { syncOneSource } from "@/lib/knowledge-sources/sync-source"
import { assertKnowledgeDriveSourcesEnabled } from "@/lib/knowledge-sources/feature-flag"

const MAX_FILES_PER_MANUAL_SYNC = 300

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireDirector()
    await assertKnowledgeDriveSourcesEnabled(user) // MAJOR-1: гейт на каждом роуте
    const { id } = await params

    const [source] = await db
      .select()
      .from(knowledgeSources)
      .where(and(eq(knowledgeSources.id, id), eq(knowledgeSources.tenantId, user.companyId)))
      .limit(1)
    if (!source) return apiError("Источник не найден", 404)
    if (!Array.isArray(source.rootFolders) || source.rootFolders.length === 0) {
      return apiError("Сначала выберите папки для индексации", 400)
    }

    const result = await syncOneSource(source, MAX_FILES_PER_MANUAL_SYNC)
    return apiSuccess(result)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[knowledge/sources/[id]/sync]", err)
    return apiError("Синхронизация не удалась", 500)
  }
}
