// Обработка очереди отложенных Telegram-постов (вызывается cron-тиком).
//
// Бюджет одного тика: не более 4 минут суммарных sleep-пауз между чатами —
// если постов/чатов много, отправляем сколько успели, остальное — в
// следующий тик. Прогресс отслеживаем через лог доставок (deliveries):
// чат, по которому уже есть 'sent' delivery в ТЕКУЩЕМ «окне запуска» (для
// repeat-постов — последние 12 часов), пропускаем как уже отправленный.

import { and, eq, lte, gte, inArray } from "drizzle-orm"
import { FloodWaitError, FloodError } from "telegram/errors"
import { db } from "@/lib/db"
import {
  telegramScheduledPosts,
  telegramPostingChats,
  telegramPostDeliveries,
  telegramUserbotSessions,
} from "@/lib/db/schema"
import { getActiveClient } from "./client"
import { publicDir } from "@/lib/uploads-path"
import { getOrCreatePostLink, applyLinkToMessage } from "./post-links"

const TICK_SLEEP_BUDGET_MS = 4 * 60_000 // 4 минуты суммарных пауз за тик
const DELIVERY_WINDOW_MS = 12 * 60 * 60 * 1000 // 12 часов (окно "уже отправлено в этом запуске")
const MIN_PAUSE_MS = 30_000
const MAX_PAUSE_MS = 90_000
const MAX_FLOOD_WAIT_RESCHEDULE_MS = 60 * 60 * 1000 // не переносить дольше часа за раз, даже если Telegram просит больше
const PEER_FLOOD_PAUSE_MS = 24 * 60 * 60 * 1000 // PEER_FLOOD — серьёзнее FLOOD_WAIT, консервативная авто-пауза на сутки

// Разгон суточного лимита для СВЕЖЕПОДКЛЮЧЁННОГО аккаунта — новый/только что
// начавший автоматизацию аккаунт куда заметнее для антиспам-систем Telegram,
// даже на "разумных" объёмах. Ограничивает эффективный лимит независимо от
// daily_limit, который владелец мог выставить выше, первую неделю.
const WARMUP_STEPS: Array<{ maxAgeDays: number; cap: number }> = [
  { maxAgeDays: 1, cap: 3 },
  { maxAgeDays: 3, cap: 8 },
  { maxAgeDays: 7, cap: 15 },
]

function applyWarmupCap(configuredLimit: number, firstActivatedAt: Date | null): number {
  if (!firstActivatedAt) return configuredLimit // ещё ни разу не логинились штатно — нечего разгонять
  const ageDays = (Date.now() - firstActivatedAt.getTime()) / (24 * 60 * 60 * 1000)
  const step = WARMUP_STEPS.find((s) => ageDays < s.maxAgeDays)
  return step ? Math.min(configuredLimit, step.cap) : configuredLimit
}

// Лимиты Telegram: подпись к фото/файлу — 1024 символа, обычный текст — 4096.
// Используется и здесь (защита от постов, созданных до валидации в API), и в
// API-роуте постов (упреждающая проверка при создании/редактировании).
export const TELEGRAM_CAPTION_LIMIT = 1024
export const TELEGRAM_TEXT_LIMIT = 4096

const TRACKING_LINK_RESERVE = 60 // запас под "\n\n" + короткую ссылку /go/{code}, если задан link_url

export function validatePostLength(body: string, hasImage: boolean, hasLink = false): string | null {
  const reserve = hasLink ? TRACKING_LINK_RESERVE : 0
  const limit = (hasImage ? TELEGRAM_CAPTION_LIMIT : TELEGRAM_TEXT_LIMIT) - reserve
  if (body.length > limit) {
    return hasImage
      ? `Текст с картинкой длиннее лимита Telegram (${TELEGRAM_CAPTION_LIMIT} симв.${hasLink ? ", с учётом ссылки" : ""}, сейчас ${body.length}) — уберите картинку, ссылку или сократите текст`
      : `Текст поста длиннее лимита Telegram (${TELEGRAM_TEXT_LIMIT} симв.${hasLink ? ", с учётом ссылки" : ""}, сейчас ${body.length})`
  }
  return null
}

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

/**
 * Момент отправки для конкретного чата при разнесении по времени
 * (stagger_minutes > 0): чаты, отсортированные по id (стабильный порядок
 * между тиками), равномерно распределяются на staggerMinutes от scheduledAt.
 * allChatIds — ВСЕ выбранные чаты поста (не только ещё не отправленные) —
 * иначе позиция "сползает" по мере отправки чатов в предыдущих тиках.
 */
function buildDueAtMap(
  allChatIds: string[],
  scheduledAt: Date,
  staggerMinutes: number
): Map<string, Date> {
  const sorted = [...allChatIds].sort()
  const map = new Map<string, Date>()
  if (staggerMinutes <= 0 || sorted.length <= 1) {
    for (const id of sorted) map.set(id, scheduledAt)
    return map
  }
  const stepMinutes = staggerMinutes / (sorted.length - 1)
  sorted.forEach((id, index) => {
    map.set(id, new Date(scheduledAt.getTime() + index * stepMinutes * 60_000))
  })
  return map
}

export interface ProcessDuePostsResult {
  postsChecked: number
  postsSent: number
  postsErrored: number
  deliveriesSent: number
  deliveriesFailed: number
  budgetExhausted: boolean
  floodWaitHit: boolean
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
    floodWaitHit: false,
  }

  // Аккаунты на ручной аварийной паузе (владелец) ИЛИ на авто-паузе после
  // PEER_FLOOD — их посты вообще не трогаем в этом тике (даже статус
  // 'sending' не проставляем), чтобы не создавать лишних деливери-попыток.
  const allSessions = await db
    .select({
      userId: telegramUserbotSessions.userId,
      sendingPaused: telegramUserbotSessions.sendingPaused,
      peerFloodUntil: telegramUserbotSessions.peerFloodUntil,
    })
    .from(telegramUserbotSessions)
  const pausedUserIds = new Set(
    allSessions
      .filter((s) => s.sendingPaused || (s.peerFloodUntil && s.peerFloodUntil.getTime() > now.getTime()))
      .map((s) => s.userId)
  )

  let sleepBudgetUsedMs = 0

  for (const post of due) {
    if (sleepBudgetUsedMs >= TICK_SLEEP_BUDGET_MS) {
      result.budgetExhausted = true
      break
    }
    if (result.floodWaitHit) {
      // Telegram уже пожаловался на флуд в этом тике (один аккаунт на все
      // посты) — дальнейшие попытки в этом же тике только усугубят лимит.
      break
    }
    if (pausedUserIds.has(post.userId)) {
      continue
    }

    // Атомарный claim: UPDATE условен на status='scheduled' (не просто
    // WHERE id=...) — если два тика крона пересекутся по времени (напр.
    // ручной запуск совпал с расписанием, или дублирующийся crontab на
    // сервере), только ОДИН из них получит claimed.length===1 и продолжит
    // отправку; второй увидит 0 обновлённых строк и молча пропустит пост
    // (не будет второй попытки отправки в тот же чат).
    const claimed = await db
      .update(telegramScheduledPosts)
      .set({ status: "sending", updatedAt: new Date() })
      .where(and(eq(telegramScheduledPosts.id, post.id), eq(telegramScheduledPosts.status, "scheduled")))
      .returning({ id: telegramScheduledPosts.id })
    if (claimed.length === 0) {
      // Пост уже забрал параллельный запуск (или статус сменился между
      // select due и этим UPDATE) — не наш, пропускаем.
      continue
    }

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

      // Разнесение по времени: считаем dueAt по ПОЛНОМУ списку выбранных чатов
      // поста (chatIds), не по pending — позиция в порядке должна быть стабильной
      // между тиками независимо от того, что уже отправлено.
      const dueAtMap = buildDueAtMap(chatIds, post.scheduledAt, post.staggerMinutes ?? 0)
      const dueNow = pending.filter((c) => {
        const dueAt = dueAtMap.get(c.id) ?? post.scheduledAt
        return dueAt.getTime() <= now.getTime()
      })
      if (dueNow.length === 0) {
        // Все оставшиеся чаты ждут своего времени в разносе — пост остаётся
        // 'scheduled', следующий тик проверит снова (без delivery-записи).
        await db
          .update(telegramScheduledPosts)
          .set({ status: "scheduled", updatedAt: new Date() })
          .where(eq(telegramScheduledPosts.id, post.id))
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

      // Проверка лимита длины ДО отправки — защита от постов, созданных до
      // появления валидации в API (POST/PATCH /posts), и от изменений
      // картинки/текста между сохранением и отправкой.
      const lengthError = validatePostLength(post.body, Boolean(post.imagePath), Boolean(post.linkUrl))
      if (lengthError) {
        await client.disconnect().catch(() => {})
        await db
          .update(telegramScheduledPosts)
          .set({ status: "error", lastError: lengthError, updatedAt: new Date() })
          .where(eq(telegramScheduledPosts.id, post.id))
        result.postsErrored++
        continue
      }

      let floodWaitSeconds: number | null = null
      let peerFloodDetected = false
      try {
        for (const chat of dueNow) {
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
            let message = post.body
            if (post.linkUrl) {
              const trackingUrl = await getOrCreatePostLink(post.id, chat.id, post.linkUrl)
              message = applyLinkToMessage(message, trackingUrl)
            }
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
            const isWaitFlood = sendErr instanceof FloodWaitError
            // PEER_FLOOD — отдельный, более серьёзный сигнал: "слишком много
            // НОВЫХ адресатов" (обычный FloodWaitError — просто "слишком
            // часто", с известным временем ожидания). У PEER_FLOOD его нет —
            // Telegram не говорит, сколько ждать, поэтому реагируем сильно
            // консервативнее (сутки), а не секундами/минутами.
            const isPeerFlood = !isWaitFlood && sendErr instanceof FloodError && sendErr.errorMessage === "PEER_FLOOD"
            await db.insert(telegramPostDeliveries).values({
              postId: post.id,
              chatId: chat.id,
              status: "failed",
              error: isWaitFlood
                ? `Telegram: флуд-лимит, подождите ${sendErr.seconds} сек`
                : isPeerFlood
                ? "Telegram: PEER_FLOOD — слишком активная рассылка новым адресатам"
                : sendErr instanceof Error ? sendErr.message.slice(0, 500) : String(sendErr).slice(0, 500),
            })
            result.deliveriesFailed++
            if (isWaitFlood) {
              // Флуд-лимит — на весь аккаунт, не на конкретный чат: пробовать
              // остальные чаты в этом тике бессмысленно, только продлит бан.
              floodWaitSeconds = sendErr.seconds
              result.floodWaitHit = true
              break
            }
            if (isPeerFlood) {
              peerFloodDetected = true
              result.floodWaitHit = true
              break
            }
          }

          // Пауза между чатами, отправленными В ЭТОТ ТИК (кроме последнего).
          // При разносе по времени чаты и так разделены stagger-интервалом —
          // доп. пауза 30-90с не нужна между чатами, которые ждали своего часа
          // в разных тиках, но по-прежнему нужна между несколькими чатами,
          // "созревшими" одновременно в рамках одного тика.
          const isLast = chat === dueNow[dueNow.length - 1]
          if (!isLast) {
            const pause = randomPauseMs()
            sleepBudgetUsedMs += pause
            await sleep(pause)
          }
        }
      } finally {
        await client.disconnect().catch(() => {})
      }

      if (peerFloodDetected) {
        // Серьёзный сигнал — ставим аккаунт на 24ч авто-паузу целиком (не
        // только этот пост): все его посты будут пропускаться в начале
        // следующих тиков (см. pausedUserIds выше), пока пауза не истечёт.
        const resumeAt = new Date(now.getTime() + PEER_FLOOD_PAUSE_MS)
        await db
          .update(telegramUserbotSessions)
          .set({ peerFloodUntil: resumeAt, updatedAt: new Date() })
          .where(eq(telegramUserbotSessions.userId, post.userId))
        await db
          .update(telegramScheduledPosts)
          .set({
            status: "scheduled",
            scheduledAt: resumeAt,
            lastError: `PEER_FLOOD от Telegram — аккаунт автоматически поставлен на паузу на 24ч (до ${resumeAt.toLocaleString("ru", { timeZone: "Europe/Moscow" })} МСК). Стоит снизить частоту и охват рассылки.`,
            updatedAt: new Date(),
          })
          .where(eq(telegramScheduledPosts.id, post.id))
        continue
      }

      if (floodWaitSeconds != null) {
        // Не оставляем пост "на попозже по кругу" — явно откладываем на время
        // флуд-лимита (с потолком, чтобы аномально большое значение от
        // Telegram не заморозило пост на неадекватный срок).
        const resumeAt = new Date(now.getTime() + Math.min(floodWaitSeconds * 1000, MAX_FLOOD_WAIT_RESCHEDULE_MS))
        await db
          .update(telegramScheduledPosts)
          .set({
            status: "scheduled",
            scheduledAt: resumeAt,
            lastError: `Флуд-лимит Telegram — возобновление после ${resumeAt.toLocaleString("ru", { timeZone: "Europe/Moscow" })} МСК`,
            updatedAt: new Date(),
          })
          .where(eq(telegramScheduledPosts.id, post.id))
        continue
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
    .select({ dailyLimit: telegramUserbotSessions.dailyLimit, firstActivatedAt: telegramUserbotSessions.firstActivatedAt })
    .from(telegramUserbotSessions)
    .where(eq(telegramUserbotSessions.userId, userId))
    .limit(1)
  return applyWarmupCap(row?.dailyLimit ?? 20, row?.firstActivatedAt ?? null)
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

/**
 * Тестовая отправка ЧЕРНОВИКА поста в «Избранное» владельца (Saved Messages,
 * peer "me") — до постановки в очередь на реальные чаты. НЕ пишет в БД
 * (не создаёт пост/доставку), просто отправляет и возвращает результат.
 * Трекинг-ссылка НЕ подставляется — тест не привязан к конкретному чату.
 */
export async function sendTestToSelf(
  userId: string,
  body: string,
  imagePath: string | null
): Promise<{ ok: true }> {
  const lengthError = validatePostLength(body, Boolean(imagePath))
  if (lengthError) throw new Error(lengthError)

  const client = await getActiveClient(userId)
  try {
    const me = await client.getInputEntity("me")
    if (imagePath) {
      await client.sendFile(me, { file: resolveImageAbsPath(imagePath), caption: body })
    } else {
      await client.sendMessage(me, { message: body })
    }
    return { ok: true }
  } finally {
    await client.disconnect().catch(() => {})
  }
}
