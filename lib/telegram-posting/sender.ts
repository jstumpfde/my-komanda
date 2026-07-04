// Обработка очереди отложенных Telegram-постов (вызывается cron-тиком).
//
// Бюджет одного тика: не более 4 минут суммарных sleep-пауз между чатами —
// если постов/чатов много, отправляем сколько успели, остальное — в
// следующий тик. Прогресс отслеживаем через лог доставок (deliveries):
// чат, по которому уже есть 'sent' delivery в ТЕКУЩЕМ «окне запуска» (для
// repeat-постов — последние 12 часов), пропускаем как уже отправленный.

import { and, eq, lte, gte, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  telegramScheduledPosts,
  telegramPostingChats,
  telegramPostDeliveries,
  telegramUserbotSessions,
} from "@/lib/db/schema"
import { getActiveClient } from "./client"
import { publicDir } from "@/lib/uploads-path"

const TICK_SLEEP_BUDGET_MS = 4 * 60_000 // 4 минуты суммарных пауз за тик
const DELIVERY_WINDOW_MS = 12 * 60 * 60 * 1000 // 12 часов (окно "уже отправлено в этом запуске")
const MIN_PAUSE_MS = 30_000
const MAX_PAUSE_MS = 90_000

function randomPauseMs(): number {
  return MIN_PAUSE_MS + Math.floor(Math.random() * (MAX_PAUSE_MS - MIN_PAUSE_MS))
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function resolveImageAbsPath(imagePath: string): string {
  // imagePath хранится как "/uploads/{companyId}/{filename}" (см. app/api/upload).
  // publicDir(...) даёт <cwd>/public/... — убираем ведущий слэш, чтобы не
  // получить абсолютный путь, "перебивающий" базу в path.join.
  const rel = imagePath.replace(/^\/+/, "")
  return publicDir(rel)
}

export interface ProcessDuePostsResult {
  postsChecked: number
  postsSent: number
  postsErrored: number
  deliveriesSent: number
  deliveriesFailed: number
  budgetExhausted: boolean
}

export async function processDuePosts(): Promise<ProcessDuePostsResult> {
  const now = new Date()
  const due = await db
    .select()
    .from(telegramScheduledPosts)
    .where(and(eq(telegramScheduledPosts.status, "scheduled"), lte(telegramScheduledPosts.scheduledAt, now)))

  const result: ProcessDuePostsResult = {
    postsChecked: due.length,
    postsSent: 0,
    postsErrored: 0,
    deliveriesSent: 0,
    deliveriesFailed: 0,
    budgetExhausted: false,
  }

  let sleepBudgetUsedMs = 0

  for (const post of due) {
    if (sleepBudgetUsedMs >= TICK_SLEEP_BUDGET_MS) {
      result.budgetExhausted = true
      break
    }

    await db
      .update(telegramScheduledPosts)
      .set({ status: "sending", updatedAt: new Date() })
      .where(eq(telegramScheduledPosts.id, post.id))

    try {
      const chatIds = Array.isArray(post.chatIds) ? (post.chatIds as string[]) : []
      if (chatIds.length === 0) {
        await finalizePost(post.id, post.repeatRule, "нет выбранных чатов")
        continue
      }

      const chats = await db
        .select()
        .from(telegramPostingChats)
        .where(and(inArray(telegramPostingChats.id, chatIds), eq(telegramPostingChats.isEnabled, true)))

      if (chats.length === 0) {
        await finalizePost(post.id, post.repeatRule, "все выбранные чаты отключены")
        continue
      }

      // Чаты, по которым уже есть 'sent' delivery в текущем окне запуска —
      // пропускаем (важно для докрутки после исчерпания бюджета тика И для
      // repeat-постов, чтобы не слать дубль в то же окно).
      const windowStart = new Date(now.getTime() - DELIVERY_WINDOW_MS)
      const recentDeliveries = await db
        .select({ chatId: telegramPostDeliveries.chatId, status: telegramPostDeliveries.status })
        .from(telegramPostDeliveries)
        .where(
          and(
            eq(telegramPostDeliveries.postId, post.id),
            gte(telegramPostDeliveries.sentAt, windowStart)
          )
        )
      const alreadySent = new Set(
        recentDeliveries.filter((d) => d.status === "sent").map((d) => d.chatId)
      )

      const pending = chats.filter((c) => !alreadySent.has(c.id))
      if (pending.length === 0) {
        await finalizePost(post.id, post.repeatRule)
        result.postsSent++
        continue
      }

      // Дневной лимит отправок владельца аккаунта (анти-спам) — считается по
      // ВСЕМ постам пользователя за 24 часа, не по одному посту.
      const dailyLimit = await getDailyLimit(post.userId)
      const sentLast24h = await countUserDeliveriesSince(post.userId, new Date(now.getTime() - 24 * 60 * 60 * 1000))

      let remainingQuota = dailyLimit - sentLast24h
      if (remainingQuota <= 0) {
        // Упёрлись в дневной лимит — откладываем на час, продолжаем в след. раз.
        await db
          .update(telegramScheduledPosts)
          .set({
            status: "scheduled",
            scheduledAt: new Date(now.getTime() + 60 * 60 * 1000),
            lastError: "дневной лимит",
            updatedAt: new Date(),
          })
          .where(eq(telegramScheduledPosts.id, post.id))
        continue
      }

      let client: Awaited<ReturnType<typeof getActiveClient>>
      try {
        client = await getActiveClient(post.userId)
      } catch (err) {
        await db
          .update(telegramScheduledPosts)
          .set({
            status: "scheduled",
            lastError: err instanceof Error ? err.message : String(err),
            updatedAt: new Date(),
          })
          .where(eq(telegramScheduledPosts.id, post.id))
        result.postsErrored++
        continue
      }

      try {
        for (const chat of pending) {
          if (remainingQuota <= 0) {
            break
          }
          if (sleepBudgetUsedMs >= TICK_SLEEP_BUDGET_MS) {
            result.budgetExhausted = true
            break
          }

          try {
            // tg_peer_id хранится строкой (может быть длиннее safe-integer в
            // редких случаях); getInputEntity принимает PeerID как number —
            // для подавляющего большинства групп/каналов этого достаточно.
            const peer = await client.getInputEntity(Number(chat.tgPeerId))
            const message = post.body
            let tgMessageId: string | null = null

            if (post.imagePath) {
              const absPath = resolveImageAbsPath(post.imagePath)
              const sent = await client.sendFile(peer, { file: absPath, caption: message })
              tgMessageId = String(sent.id)
            } else {
              const sent = await client.sendMessage(peer, { message })
              tgMessageId = String(sent.id)
            }

            await db.insert(telegramPostDeliveries).values({
              postId: post.id,
              chatId: chat.id,
              status: "sent",
              tgMessageId,
            })
            result.deliveriesSent++
            remainingQuota--
          } catch (sendErr) {
            await db.insert(telegramPostDeliveries).values({
              postId: post.id,
              chatId: chat.id,
              status: "failed",
              error: sendErr instanceof Error ? sendErr.message.slice(0, 500) : String(sendErr).slice(0, 500),
            })
            result.deliveriesFailed++
          }

          // Пауза между чатами (кроме случая, когда это был последний в списке).
          const isLast = chat === pending[pending.length - 1]
          if (!isLast) {
            const pause = randomPauseMs()
            sleepBudgetUsedMs += pause
            await sleep(pause)
          }
        }
      } finally {
        await client.disconnect().catch(() => {})
      }

      // Проверяем, остались ли чаты без успешной доставки в этом окне.
      const stillPendingCount = await countStillPending(post.id, chats.map((c) => c.id), windowStart)
      if (stillPendingCount > 0) {
        // Не всё разослали (бюджет тика/лимит/ошибки) — оставляем 'scheduled',
        // следующий тик докрутит оставшиеся (уже отправленные — пропустит по логу).
        await db
          .update(telegramScheduledPosts)
          .set({ status: "scheduled", updatedAt: new Date() })
          .where(eq(telegramScheduledPosts.id, post.id))
      } else {
        await finalizePost(post.id, post.repeatRule)
        result.postsSent++
      }
    } catch (err) {
      result.postsErrored++
      await db
        .update(telegramScheduledPosts)
        .set({
          status: "error",
          lastError: err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500),
          updatedAt: new Date(),
        })
        .where(eq(telegramScheduledPosts.id, post.id))
    }
  }

  return result
}

async function getDailyLimit(userId: string): Promise<number> {
  const [row] = await db
    .select({ dailyLimit: telegramUserbotSessions.dailyLimit })
    .from(telegramUserbotSessions)
    .where(eq(telegramUserbotSessions.userId, userId))
    .limit(1)
  return row?.dailyLimit ?? 20
}

async function countUserDeliveriesSince(userId: string, since: Date): Promise<number> {
  const rows = await db
    .select({ id: telegramPostDeliveries.id })
    .from(telegramPostDeliveries)
    .innerJoin(
      telegramScheduledPosts,
      eq(telegramPostDeliveries.postId, telegramScheduledPosts.id)
    )
    .where(
      and(
        eq(telegramScheduledPosts.userId, userId),
        eq(telegramPostDeliveries.status, "sent"),
        gte(telegramPostDeliveries.sentAt, since)
      )
    )
  return rows.length
}

async function countStillPending(postId: string, chatIds: string[], windowStart: Date): Promise<number> {
  if (chatIds.length === 0) return 0
  const sentRows = await db
    .select({ chatId: telegramPostDeliveries.chatId })
    .from(telegramPostDeliveries)
    .where(
      and(
        eq(telegramPostDeliveries.postId, postId),
        eq(telegramPostDeliveries.status, "sent"),
        gte(telegramPostDeliveries.sentAt, windowStart)
      )
    )
  const sentSet = new Set(sentRows.map((r) => r.chatId))
  return chatIds.filter((id) => !sentSet.has(id)).length
}

async function finalizePost(postId: string, repeatRule: string, lastError?: string): Promise<void> {
  if (repeatRule === "daily") {
    const [row] = await db
      .select({ scheduledAt: telegramScheduledPosts.scheduledAt })
      .from(telegramScheduledPosts)
      .where(eq(telegramScheduledPosts.id, postId))
      .limit(1)
    const base = row?.scheduledAt ?? new Date()
    await db
      .update(telegramScheduledPosts)
      .set({
        status: "scheduled",
        scheduledAt: new Date(base.getTime() + 24 * 60 * 60 * 1000),
        lastError: lastError ?? null,
        updatedAt: new Date(),
      })
      .where(eq(telegramScheduledPosts.id, postId))
  } else if (repeatRule === "weekly") {
    const [row] = await db
      .select({ scheduledAt: telegramScheduledPosts.scheduledAt })
      .from(telegramScheduledPosts)
      .where(eq(telegramScheduledPosts.id, postId))
      .limit(1)
    const base = row?.scheduledAt ?? new Date()
    await db
      .update(telegramScheduledPosts)
      .set({
        status: "scheduled",
        scheduledAt: new Date(base.getTime() + 7 * 24 * 60 * 60 * 1000),
        lastError: lastError ?? null,
        updatedAt: new Date(),
      })
      .where(eq(telegramScheduledPosts.id, postId))
  } else {
    await db
      .update(telegramScheduledPosts)
      .set({ status: lastError ? "error" : "sent", lastError: lastError ?? null, updatedAt: new Date() })
      .where(eq(telegramScheduledPosts.id, postId))
  }
}
