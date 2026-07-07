// Аналитика чтения расшаренного разбора «Типология» (/tip/r/[shareToken]).
//
// Каждый уникальный зритель (viewerUid = cookie tip_uid клиента, НЕ владелец
// разбора) учитывается один раз в tip_share_views (upsert по (run_id,
// viewer_uid)); суммарное время видимости страницы и максимальный процент
// прокрутки накапливаются по повторным вызовам одного визита. При первом
// просмотре НОВОГО зрителя инкрементируем денорм tip_runs.views_count и
// проверяем пороги уведомления владельца (checkViewNotification).
//
// Владелец, смотрящий свою же ссылку (viewerUid === run.userId), НЕ считается
// просмотром — иначе счётчик рос бы от собственных визитов.

import { eq, and, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { tipRuns, tipUsers, tipShareViews, tipSettings } from "@/lib/db/schema"
import { sendTipTelegram, buildViewNotifyText } from "@/lib/tip/notify"
import { getAppBaseUrl } from "@/lib/funnel-v2/base-url"

const MAX_SECONDS_VISIBLE = 3600 // потолок накопления — 1 час, защита от «оставил вкладку открытой»

export interface RecordViewInput {
  shareToken: string
  viewerUid: string
  source?: string
  addSeconds?: number   // 0..30 за один вызов (клиент шлёт короткие тики)
  scrollPct?: number    // 0..100
}

/**
 * Записывает/обновляет просмотр расшаренного разбора. Fire-and-forget по
 * контракту вызывающего роута — не бросает наружу (роут всегда отвечает 200),
 * но внутри залогирует неожиданные ошибки в консоль.
 */
export async function recordView(input: RecordViewInput): Promise<void> {
  try {
    const { shareToken, viewerUid } = input
    if (!shareToken || !viewerUid) return

    const [run] = await db.select().from(tipRuns).where(eq(tipRuns.shareToken, shareToken)).limit(1)
    if (!run || run.status !== "done") return

    // Владелец смотрит свою же ссылку — не считаем как просмотр.
    if (run.userId === viewerUid) return

    const addSeconds = clamp(Math.round(input.addSeconds ?? 0), 0, 30)
    const scrollPct = clamp(Math.round(input.scrollPct ?? 0), 0, 100)
    const source = input.source?.trim() || null

    const [existing] = await db
      .select()
      .from(tipShareViews)
      .where(and(eq(tipShareViews.runId, run.id), eq(tipShareViews.viewerUid, viewerUid)))
      .limit(1)

    if (existing) {
      const nextSeconds = Math.min(existing.secondsVisible + addSeconds, MAX_SECONDS_VISIBLE)
      const nextScroll = Math.max(existing.maxScrollPct, scrollPct)
      await db
        .update(tipShareViews)
        .set({
          secondsVisible: nextSeconds,
          maxScrollPct: nextScroll,
          lastAt: new Date(),
          // Первый source остаётся авторитетным (откуда реально пришли);
          // если его не было — записываем текущий.
          source: existing.source ?? source,
        })
        .where(eq(tipShareViews.id, existing.id))
      return
    }

    // Новый зритель — insert + инкремент денорм-счётчика + проверка порогов.
    // onConflictDoNothing на случай гонки двух параллельных первых тиков.
    const inserted = await db
      .insert(tipShareViews)
      .values({
        runId: run.id,
        viewerUid,
        source,
        secondsVisible: addSeconds,
        maxScrollPct: scrollPct,
      })
      .onConflictDoNothing({ target: [tipShareViews.runId, tipShareViews.viewerUid] })
      .returning({ id: tipShareViews.id })

    if (inserted.length === 0) {
      // Кто-то успел вставить первым между select и insert — досчитать как update.
      await recordView(input)
      return
    }

    const [updatedRun] = await db
      .update(tipRuns)
      .set({ viewsCount: sql`${tipRuns.viewsCount} + 1` })
      .where(eq(tipRuns.id, run.id))
      .returning({ viewsCount: tipRuns.viewsCount })

    const viewsCount = updatedRun?.viewsCount ?? run.viewsCount + 1
    await checkViewNotification(run.id, run.userId, viewsCount)
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[tip] recordView", e)
  }
}

/**
 * Если views_count только что пересёк один из порогов из tip_settings
 * (view_notify_thresholds) и у владельца есть tg_chat_id — отправляет
 * уведомление. Сравнение "==" по точному значению счётчика (не диапазон) —
 * пороги растущие, каждый шлётся ровно один раз при точном совпадении.
 */
async function checkViewNotification(runId: string, ownerUserId: string, viewsCount: number): Promise<void> {
  const thresholds = await getViewNotifyThresholds()
  if (!thresholds.includes(viewsCount)) return

  const [owner] = await db.select().from(tipUsers).where(eq(tipUsers.id, ownerUserId)).limit(1)
  if (!owner?.tgChatId) return

  const appUrl = getAppBaseUrl()
  await sendTipTelegram(owner.tgChatId, buildViewNotifyText(viewsCount, appUrl))
}

async function getViewNotifyThresholds(): Promise<number[]> {
  const [row] = await db
    .select()
    .from(tipSettings)
    .where(eq(tipSettings.key, "view_notify_thresholds"))
    .limit(1)
  const value = row?.valueJson
  if (Array.isArray(value) && value.every((v) => typeof v === "number")) {
    return value as number[]
  }
  return [1, 5, 10, 25, 50, 100]
}

export interface RunStats {
  viewsTotal: number
  viewsUnique: number
  totalSeconds: number
  avgScrollPct: number
}

/** Статистика просмотров прогона — только для отображения владельцу. */
export async function getRunStats(runId: string): Promise<RunStats> {
  const rows = await db.select().from(tipShareViews).where(eq(tipShareViews.runId, runId))

  const viewsUnique = rows.length
  const totalSeconds = rows.reduce((sum, r) => sum + r.secondsVisible, 0)
  const avgScrollPct = viewsUnique > 0
    ? Math.round(rows.reduce((sum, r) => sum + r.maxScrollPct, 0) / viewsUnique)
    : 0

  const [run] = await db.select({ viewsCount: tipRuns.viewsCount }).from(tipRuns).where(eq(tipRuns.id, runId)).limit(1)

  return {
    viewsTotal: run?.viewsCount ?? viewsUnique,
    viewsUnique,
    totalSeconds,
    avgScrollPct,
  }
}

function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min
  return Math.max(min, Math.min(max, n))
}
