// Синк одного источника: краул выбранных папок → дифф по (path, contentHash)
// → скачивание+индексация изменённых → soft-delete исчезнувших. Общая точка
// для app/api/cron/knowledge-drive-sync (все активные источники по бюджету
// файлов на тик) и app/api/modules/knowledge/sources/[id]/sync (ручной
// триггер «Синхронизировать сейчас» на один источник).

import { and, eq, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { knowledgeSources, knowledgeSourceDocuments, type KnowledgeSource } from "@/lib/db/schema"
import { getValidYandexDiskToken } from "./get-valid-token"
import { YandexDiskAdapter } from "./adapters/yandex-disk"
import { resolveAiOptOut } from "./root-folders"
import { indexDocument } from "./indexer"

export interface SyncSourceResult {
  filesTouched: number
  indexed: number
  skipped: number
  errors: number
  errorMessages: string[]
}

function emptyResult(): SyncSourceResult {
  return { filesTouched: 0, indexed: 0, skipped: 0, errors: 0, errorMessages: [] }
}

/** Синкает один источник. maxFiles — бюджет файлов, трогаемых в этом вызове (0 = не начинать). */
export async function syncOneSource(source: KnowledgeSource, maxFiles: number): Promise<SyncSourceResult> {
  const result = emptyResult()
  if (maxFiles <= 0) return result
  if (!Array.isArray(source.rootFolders) || source.rootFolders.length === 0) return result
  if (source.provider !== "yandex_disk") return result // фаза 1 — только Диск

  try {
    const accessToken = await getValidYandexDiskToken(source.id)
    if (!accessToken) {
      await db.update(knowledgeSources).set({ status: "error", lastError: "Токен недоступен — переподключите источник" })
        .where(eq(knowledgeSources.id, source.id))
      return result
    }

    const adapter = new YandexDiskAdapter()
    const seenPaths = new Set<string>()

    outer: for (const folder of source.rootFolders) {
      for await (const file of adapter.crawlFolder(accessToken, folder.path)) {
        if (result.filesTouched >= maxFiles) break outer
        seenPaths.add(file.path)

        const [existing] = await db
          .select()
          .from(knowledgeSourceDocuments)
          .where(and(
            eq(knowledgeSourceDocuments.sourceId, source.id),
            eq(knowledgeSourceDocuments.externalPath, file.path),
          ))
          .limit(1)

        const aiOptOut = resolveAiOptOut(source.rootFolders, file.path)
        const unchanged = Boolean(
          existing && existing.status === "indexed" && !existing.deletedAt &&
          existing.contentHash && file.contentHash && existing.contentHash === file.contentHash,
        )
        if (unchanged) {
          // Файл не изменился — только освежить aiOptOut, если папку
          // переключили без изменения самого файла.
          if (existing!.aiOptOut !== aiOptOut) {
            await db.update(knowledgeSourceDocuments)
              .set({ aiOptOut, updatedAt: new Date() })
              .where(eq(knowledgeSourceDocuments.id, existing!.id))
          }
          continue
        }

        result.filesTouched++
        let docId = existing?.id
        if (!docId) {
          const [inserted] = await db.insert(knowledgeSourceDocuments).values({
            tenantId: source.tenantId,
            sourceId: source.id,
            externalPath: file.path,
            name: file.name,
            mimeType: file.mimeType,
            sizeBytes: file.sizeBytes,
            providerModifiedAt: file.modifiedAt,
            contentHash: file.contentHash,
            status: "pending",
            aiOptOut,
          }).returning({ id: knowledgeSourceDocuments.id })
          docId = inserted.id
        } else {
          await db.update(knowledgeSourceDocuments).set({
            name: file.name,
            mimeType: file.mimeType,
            sizeBytes: file.sizeBytes,
            providerModifiedAt: file.modifiedAt,
            contentHash: file.contentHash,
            aiOptOut,
            deletedAt: null,
            status: "pending",
            updatedAt: new Date(),
          }).where(eq(knowledgeSourceDocuments.id, docId))
        }

        try {
          const buffer = await adapter.downloadContent(accessToken, file.path)
          const indexResult = await indexDocument({
            companyId: source.tenantId,
            document: { id: docId, sourceId: source.id, name: file.name, externalPath: file.path },
            buffer,
            mimeType: file.mimeType,
          })
          if (indexResult.status === "indexed") result.indexed++
          else if (indexResult.status === "skipped") result.skipped++
          else result.errors++
        } catch (err) {
          result.errors++
          const msg = err instanceof Error ? err.message : String(err)
          result.errorMessages.push(`${file.path}: ${msg}`)
          await db.update(knowledgeSourceDocuments)
            .set({ status: "error", skipReason: msg.slice(0, 500), updatedAt: new Date() })
            .where(eq(knowledgeSourceDocuments.id, docId))
        }
      }
    }

    // Исчезнувшие файлы — soft-delete (окно 30 дней, паттерн корзины
    // вакансий). Только если краул реально что-то увидел — иначе временный
    // сбой API мог бы стереть весь источник до «не осталось файлов».
    if (seenPaths.size > 0) {
      const existingDocs = await db
        .select({ id: knowledgeSourceDocuments.id, externalPath: knowledgeSourceDocuments.externalPath })
        .from(knowledgeSourceDocuments)
        .where(and(
          eq(knowledgeSourceDocuments.sourceId, source.id),
          isNull(knowledgeSourceDocuments.deletedAt),
        ))
      const gone = existingDocs.filter((d) => !seenPaths.has(d.externalPath))
      for (const g of gone) {
        await db.update(knowledgeSourceDocuments)
          .set({ status: "deleted", deletedAt: new Date(), updatedAt: new Date() })
          .where(eq(knowledgeSourceDocuments.id, g.id))
      }
    }

    await db.update(knowledgeSources).set({
      lastSyncAt: new Date(),
      lastFullCrawlAt: new Date(),
      status: "active",
      lastError: null,
      updatedAt: new Date(),
    }).where(eq(knowledgeSources.id, source.id))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    result.errorMessages.push(`source ${source.id}: ${msg}`)
    await db.update(knowledgeSources)
      .set({ status: "error", lastError: msg.slice(0, 500), updatedAt: new Date() })
      .where(eq(knowledgeSources.id, source.id))
      .catch(() => {})
  }

  return result
}
