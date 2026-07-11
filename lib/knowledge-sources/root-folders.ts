// Резолвинг настроек папки (аудитория/aiOptOut) для конкретного пути файла —
// используется при краул-цикле, чтобы денормализовать aiOptOut на
// knowledge_source_documents (см. комментарий в lib/db/schema.ts —
// избегаем jsonb-матчинга на каждый retrieval-запрос).

import type { KnowledgeSourceRootFolder } from "@/lib/db/schema"

/** Находит самую специфичную (длиннейший путь) настроенную папку для файла. */
export function findRootFolder(
  rootFolders: KnowledgeSourceRootFolder[],
  filePath: string,
): KnowledgeSourceRootFolder | null {
  let best: KnowledgeSourceRootFolder | null = null
  for (const f of rootFolders) {
    const prefix = f.path.endsWith("/") ? f.path : `${f.path}/`
    if (filePath === f.path || filePath.startsWith(prefix)) {
      if (!best || f.path.length > best.path.length) best = f
    }
  }
  return best
}

export function resolveAiOptOut(rootFolders: KnowledgeSourceRootFolder[], filePath: string): boolean {
  return findRootFolder(rootFolders, filePath)?.aiOptOut ?? false
}
