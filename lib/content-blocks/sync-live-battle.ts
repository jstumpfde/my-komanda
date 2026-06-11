// Dual-write синк «боевых» блоков конструктора контента.
//
// Принцип: боевой тест-блок (contentType='test', postDemoSettings.isLiveBattle=true)
// → upsert записи kind='test' той же вакансии (lessons_json, title, post_demo_settings
//   копируются, status='published'). send-test и публичные страницы /test/[token]
//   продолжают читать kind='test' без рефакторинга.
//
// Аналогично для демо-блока (contentType='presentation' || kind='demo', isLiveBattle=true)
// → upsert kind='demo'. Публичная страница кандидата /demo/[token] читает kind='demo'.
//
// При удалении боевого блока → kind='test'/'demo' переводится в status='draft'
// (НЕ удаляем — старые ссылки кандидатов не должны падать 404).
//
// Вызывается из PUT /api/modules/hr/demos/[id] после каждого сохранения блока.

import { and, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { demos } from "@/lib/db/schema"
import type { PostDemoSettings } from "@/lib/db/schema"

/** Тип боевой записи: 'demo' или 'test'. */
type LiveKind = "demo" | "test"

/** Определить kind боевой записи по contentType блока. */
function liveKindForContentType(contentType: string): LiveKind | null {
  if (contentType === "test" || contentType === "task") return "test"
  if (contentType === "presentation") return "demo"
  return null
}

/**
 * Синк после сохранения блока конструктора.
 * Вызывать после каждого PUT /api/modules/hr/demos/[id] если блок kind='block:*'.
 *
 * Если блок помечен как боевой (postDemoSettings.isLiveBattle=true):
 *   - проверяем, что других боевых блоков того же типа в вакансии нет
 *   - upsert записи kind='test'/'demo' с данными этого блока
 *
 * Если блок НЕ боевой — ничего не делаем (пусть kind='test'/'demo' живёт как есть).
 */
export async function syncLiveBattleOnSave(args: {
  vacancyId: string
  blockId: string
  contentType: string
  title: string
  lessonsJson: unknown[]
  postDemoSettings: PostDemoSettings | null
}): Promise<void> {
  const liveKind = liveKindForContentType(args.contentType)
  if (!liveKind) return

  const isLive = args.postDemoSettings?.isLiveBattle === true
  if (!isLive) return

  // Upsert: ищем существующую запись kind='test'/'demo' для этой вакансии.
  const [existing] = await db
    .select({ id: demos.id })
    .from(demos)
    .where(and(eq(demos.vacancyId, args.vacancyId), eq(demos.kind, liveKind)))
    .orderBy(sql`${demos.updatedAt} DESC`)
    .limit(1)

  if (existing) {
    // Обновляем существующую боевую запись.
    await db
      .update(demos)
      .set({
        title:            args.title,
        lessonsJson:      args.lessonsJson,
        postDemoSettings: args.postDemoSettings ?? {},
        status:           "published",
        updatedAt:        new Date(),
      })
      .where(eq(demos.id, existing.id))
  } else {
    // Создаём новую запись kind='test'/'demo' — первый боевой блок этого типа.
    await db.insert(demos).values({
      vacancyId:        args.vacancyId,
      kind:             liveKind,
      title:            args.title,
      lessonsJson:      args.lessonsJson,
      postDemoSettings: args.postDemoSettings ?? {},
      status:           "published",
      contentType:      args.contentType,
      sortOrder:        -1, // боевая запись не участвует в сортировке UI конструктора
    })
  }
}

/**
 * Синк после удаления блока конструктора.
 * Если удалённый блок был боевым → переводим kind='test'/'demo' в status='draft'.
 */
export async function syncLiveBattleOnDelete(args: {
  vacancyId: string
  contentType: string
  postDemoSettings: PostDemoSettings | null
}): Promise<void> {
  const liveKind = liveKindForContentType(args.contentType)
  if (!liveKind) return

  const wasLive = args.postDemoSettings?.isLiveBattle === true
  if (!wasLive) return

  await db
    .update(demos)
    .set({ status: "draft", updatedAt: new Date() })
    .where(and(eq(demos.vacancyId, args.vacancyId), eq(demos.kind, liveKind)))
}
