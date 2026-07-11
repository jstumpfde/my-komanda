// GET /api/modules/knowledge/sources/[id]/tree?path=/ — ленивая подгрузка
// дерева папок диска для UI выбора (концепт §ux шаг 2: «Дерево диска, галочки
// на папках»). Не рекурсивный — только прямые дети запрошенного path.

import { NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { apiError, apiSuccess, requireCompany } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { knowledgeSources } from "@/lib/db/schema"
import { getValidYandexDiskToken } from "@/lib/knowledge-sources/get-valid-token"
import { YandexDiskAdapter } from "@/lib/knowledge-sources/adapters/yandex-disk"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params
    const path = req.nextUrl.searchParams.get("path") || "/"

    const [source] = await db
      .select()
      .from(knowledgeSources)
      .where(and(eq(knowledgeSources.id, id), eq(knowledgeSources.tenantId, user.companyId)))
      .limit(1)
    if (!source) return apiError("Источник не найден", 404)
    if (source.provider !== "yandex_disk") return apiError("Дерево папок пока поддерживается только для Яндекс.Диска", 400)

    const accessToken = await getValidYandexDiskToken(source.id)
    if (!accessToken) return apiError("Токен недействителен — переподключите источник", 409)

    const adapter = new YandexDiskAdapter()
    const children = await adapter.listChildren(accessToken, path)
    // Только папки (файлы в дереве выбора не нужны — выбираем ПАПКИ целиком).
    const folders = children
      .filter((c) => c.isDir)
      .map((c) => ({ path: c.path, name: c.name }))

    return apiSuccess({ path, folders })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[knowledge/sources/[id]/tree]", err)
    return apiError("Не удалось загрузить дерево папок Яндекс.Диска", 502)
  }
}
