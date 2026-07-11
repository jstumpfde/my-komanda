// DELETE /api/modules/knowledge/sources/[id] — отключить источник (директор).
// Каскадно удаляет knowledge_source_documents + knowledge_chunks (152-ФЗ
// требование из концепта — «слепки и вектора удаляются», FK onDelete cascade
// в lib/db/schema.ts). Тенант-изоляция — сама disconnectKnowledgeSource
// требует companyId в WHERE, поэтому чужой sourceId просто не найдётся.

import { NextRequest } from "next/server"
import { apiError, apiSuccess, requireDirector } from "@/lib/api-helpers"
import { disconnectKnowledgeSource } from "@/lib/knowledge-sources/disconnect"
import { assertKnowledgeDriveSourcesEnabled } from "@/lib/knowledge-sources/feature-flag"

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireDirector()
    await assertKnowledgeDriveSourcesEnabled(user) // MAJOR-1: гейт на каждом роуте
    const { id } = await params
    const disconnected = await disconnectKnowledgeSource(id, user.companyId)
    if (!disconnected) return apiError("Источник не найден", 404)
    return apiSuccess({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[knowledge/sources/[id] DELETE]", err)
    return apiError("Internal server error", 500)
  }
}
