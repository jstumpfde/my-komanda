// POST /api/modules/knowledge/sources/[id]/estimate — смета AI-токенов ДО
// старта индексации (концепт §ux шаг 3). Body: { folders?: [{path}] } —
// если не передано, считает по уже сохранённым rootFolders источника.
// Краулит ТОЛЬКО метаданные (listChildren, без скачивания контента) —
// дёшево, но на очень больших дисках может занять время, поэтому обрезаем на
// ESTIMATE_FILE_CAP файлов и честно помечаем truncated=true.

import { NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { apiError, apiSuccess, requireDirector } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { knowledgeSources } from "@/lib/db/schema"
import { getValidYandexDiskToken } from "@/lib/knowledge-sources/get-valid-token"
import { YandexDiskAdapter } from "@/lib/knowledge-sources/adapters/yandex-disk"
import { estimateIndexing } from "@/lib/knowledge-sources/estimate"
import type { SourceFileMeta } from "@/lib/knowledge-sources/adapter-types"
import { assertKnowledgeDriveSourcesEnabled } from "@/lib/knowledge-sources/feature-flag"

const ESTIMATE_FILE_CAP = 3000

export async function POST(
  req: NextRequest,
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
    if (source.provider !== "yandex_disk") return apiError("Смета пока поддерживается только для Яндекс.Диска", 400)

    const body = await req.json().catch(() => ({})) as { folders?: { path: string }[] }
    const folderPaths = (Array.isArray(body.folders) && body.folders.length > 0)
      ? body.folders.map((f) => f.path).filter((p): p is string => typeof p === "string")
      : source.rootFolders.map((f) => f.path)

    if (folderPaths.length === 0) {
      return apiSuccess({ totalFiles: 0, supportedFiles: 0, skippedFiles: 0, estimatedChars: 0, estimatedTokens: 0, truncated: false })
    }

    const accessToken = await getValidYandexDiskToken(source.id, user.companyId)
    if (!accessToken) return apiError("Токен недействителен — переподключите источник", 409)

    const adapter = new YandexDiskAdapter()
    const files: SourceFileMeta[] = []
    let truncated = false

    outer: for (const folderPath of folderPaths) {
      for await (const file of adapter.crawlFolder(accessToken, folderPath)) {
        files.push(file)
        if (files.length >= ESTIMATE_FILE_CAP) { truncated = true; break outer }
      }
    }

    const estimate = estimateIndexing(files)
    return apiSuccess({ ...estimate, truncated })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[knowledge/sources/[id]/estimate]", err)
    return apiError("Не удалось посчитать смету — проверьте подключение к Яндекс.Диску", 502)
  }
}
