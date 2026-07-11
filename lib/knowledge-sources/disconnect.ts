// Отключение источника знаний — 152-ФЗ требование из концепта
// (kb-connected-sources §risks): «при отключении источника слепки и вектора
// удаляются». knowledge_source_documents и knowledge_chunks оба объявлены с
// onDelete: "cascade" на sourceId/documentId (lib/db/schema.ts) — удаление
// строки knowledge_sources каскадно стирает все документы и чанки этого
// источника на уровне БД, без отдельного шага.
//
// Реальный revoke access_token на стороне Яндекса не делаем — OAuth Яндекса
// не даёт простого публичного revoke-эндпоинта для сторонних приложений;
// токен просто перестаёт использоваться и удаляется у нас.

import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { knowledgeSources } from "@/lib/db/schema"

export async function disconnectKnowledgeSource(sourceId: string, companyId: string): Promise<boolean> {
  const deleted = await db
    .delete(knowledgeSources)
    .where(and(eq(knowledgeSources.id, sourceId), eq(knowledgeSources.tenantId, companyId)))
    .returning({ id: knowledgeSources.id })
  return deleted.length > 0
}
