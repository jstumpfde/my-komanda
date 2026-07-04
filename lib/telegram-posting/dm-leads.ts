// Авто-атрибуция входящих ЛС владельца через userbot: если кто-то написал в
// личку владельцу, пытаемся определить, из какого чата человек пришёл — три
// слоя, по убыванию приоритета:
//   (а) общий чат из telegram_posting_chats — НЕ зависит от давности поста
//       (Telegram видит общую группу хоть через год после публикации);
//   (б) сопоставление по содержанию — ключевые слова первого сообщения лида
//       против словаря постов, отправленных в каждый чат (тоже НЕ зависит от
//       давности — совпадение "Сурин"/"Mida Grande"/название вакансии работает
//       и для поста месячной давности в "спящей" группе);
//   (в) тайминг (последняя доставка перед сообщением) — САМЫЙ СЛАБЫЙ резерв,
//       используется только если (а) и (б) ничего не дали. НЕ работает для
//       старых постов/неактивных групп — оставлен как последний шанс, не основа.

import { Api } from "telegram"
import { and, eq, desc, lte, inArray, count as sqlCount } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  telegramUserbotSessions,
  telegramPostingChats,
  telegramPostDeliveries,
  telegramScheduledPosts,
  telegramDmLeads,
} from "@/lib/db/schema"
import { getActiveClient } from "./client"

const TIMING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000 // 7 дней — крайний резерв, не основа
const FIRST_MESSAGE_MAX_LEN = 500
const MIN_TOKEN_LEN = 4

const STOPWORDS = new Set([
  "это", "что", "как", "для", "при", "или", "если", "весь", "все", "всё", "наш", "ваш", "вам", "нам",
  "они", "она", "мне", "нас", "вас", "тебя", "себя", "меня", "есть", "было", "были", "будет", "этот",
  "эта", "эти", "того", "тому", "также", "ещё", "уже", "очень", "просто", "можно", "нужно", "хочу",
  "хотел", "хотела", "интересует", "интересуют", "здравствуйте", "добрый", "день", "вечер", "утро",
  "пожалуйста", "спасибо", "подскажите", "скажите", "уточните", "уточнить", "пишите", "личку", "личке",
  "the", "and", "for", "with", "this", "that", "have", "please", "hello", "hi", "thanks", "thank", "your",
])

const STEM_LEN = 5 // грубый стемминг: русские падежные окончания обычно 1-3 буквы

// Точное совпадение слов не работает для русского — "Сурин" в посте и "Сурине"
// в сообщении лида (предложный падеж) — РАЗНЫЕ строки. Обрезаем длинные слова
// до префикса, чтобы падежные/числовые окончания не мешали совпадению.
function stem(word: string): string {
  return word.length > STEM_LEN ? word.slice(0, STEM_LEN) : word
}

function tokenize(text: string): string[] {
  const matches = text.toLowerCase().match(/[a-zа-яё]{4,}/g) ?? []
  return matches.filter((t) => t.length >= MIN_TOKEN_LEN && !STOPWORDS.has(t)).map(stem)
}

/** Словарь токенов title+body по каждому чату — из ВСЕХ когда-либо отправленных
 * постов (не ограничено окном времени: старый пост про "Сурин" всё ещё
 * достоверно указывает на чат, даже если ушёл туда 3 месяца назад). */
async function buildChatVocabulary(userId: string): Promise<Map<string, Set<string>>> {
  const rows = await db
    .select({
      chatId: telegramPostDeliveries.chatId,
      title: telegramScheduledPosts.title,
      body: telegramScheduledPosts.body,
    })
    .from(telegramPostDeliveries)
    .innerJoin(telegramScheduledPosts, eq(telegramPostDeliveries.postId, telegramScheduledPosts.id))
    .where(and(eq(telegramScheduledPosts.userId, userId), eq(telegramPostDeliveries.status, "sent")))

  const vocab = new Map<string, Set<string>>()
  for (const row of rows) {
    let set = vocab.get(row.chatId)
    if (!set) { set = new Set(); vocab.set(row.chatId, set) }
    for (const t of tokenize(`${row.title} ${row.body}`)) set.add(t)
  }
  return vocab
}

/** Скор чата = сумма весов совпавших токенов; вес токена = 1/(кол-во чатов,
 * где он встречается) — так общие слова ("апартаменты", "вакансия") почти не
 * весят, а различающие ("сурин", "grande") решают. */
function scoreChatsByKeywords(
  messageText: string,
  vocab: Map<string, Set<string>>,
  restrictTo?: Set<string>
): Array<{ chatId: string; score: number }> {
  const messageTokens = new Set(tokenize(messageText))
  if (messageTokens.size === 0) return []

  const tokenChatCount = new Map<string, number>()
  for (const [chatId, set] of vocab) {
    if (restrictTo && !restrictTo.has(chatId)) continue
    for (const t of set) {
      if (messageTokens.has(t)) tokenChatCount.set(t, (tokenChatCount.get(t) ?? 0) + 1)
    }
  }

  const scores: Array<{ chatId: string; score: number }> = []
  for (const [chatId, set] of vocab) {
    if (restrictTo && !restrictTo.has(chatId)) continue
    let score = 0
    for (const t of messageTokens) {
      if (set.has(t)) score += 1 / (tokenChatCount.get(t) ?? 1)
    }
    if (score > 0) scores.push({ chatId, score })
  }
  return scores.sort((a, b) => b.score - a.score)
}

/** Однозначный победитель: есть скор И (единственный кандидат, ИЛИ заметно
 * (>=1.5x) обходит второе место) — иначе считаем результат неоднозначным. */
function pickUnambiguousWinner(scores: Array<{ chatId: string; score: number }>): string | null {
  if (scores.length === 0) return null
  if (scores.length === 1) return scores[0].chatId
  const [first, second] = scores
  if (first.score >= second.score * 1.5) return first.chatId
  return null
}

async function pickMostActiveChat(chatIds: string[]): Promise<string | null> {
  if (chatIds.length === 0) return null
  const rows = await db
    .select({ chatId: telegramPostDeliveries.chatId, cnt: sqlCount() })
    .from(telegramPostDeliveries)
    .where(and(inArray(telegramPostDeliveries.chatId, chatIds), eq(telegramPostDeliveries.status, "sent")))
    .groupBy(telegramPostDeliveries.chatId)
    .orderBy(desc(sqlCount()))
    .limit(1)
  return rows[0]?.chatId ?? chatIds[0] ?? null
}

export interface ScanDmLeadsResult {
  dialogsChecked: number
  newLeads: number
  errors: number
}

/** Прогоняет scanDmLeads по ВСЕМ пользователям с активной сессией и включённым
 * dm_watch_enabled — вызывается из cron-тика после processDuePosts. */
export async function scanDmLeadsForAllActiveSessions(): Promise<ScanDmLeadsResult> {
  const total: ScanDmLeadsResult = { dialogsChecked: 0, newLeads: 0, errors: 0 }
  const sessions = await db
    .select({ userId: telegramUserbotSessions.userId })
    .from(telegramUserbotSessions)
    .where(and(eq(telegramUserbotSessions.status, "active"), eq(telegramUserbotSessions.dmWatchEnabled, true)))

  for (const s of sessions) {
    try {
      const r = await scanDmLeads(s.userId)
      total.dialogsChecked += r.dialogsChecked
      total.newLeads += r.newLeads
      total.errors += r.errors
    } catch (err) {
      console.error("[dm-leads] scan failed for user", s.userId, err)
      total.errors++
    }
  }
  return total
}

export async function scanDmLeads(userId: string): Promise<ScanDmLeadsResult> {
  const result: ScanDmLeadsResult = { dialogsChecked: 0, newLeads: 0, errors: 0 }

  const [session] = await db
    .select()
    .from(telegramUserbotSessions)
    .where(eq(telegramUserbotSessions.userId, userId))
    .limit(1)

  if (!session || session.status !== "active") return result

  const sinceDefault = session.lastConnectedAt ?? new Date(0)
  const since = session.dmLastCheckedAt ?? sinceDefault

  const client = await getActiveClient(userId)
  try {
    const dialogs = await client.getDialogs({ limit: 100 })

    // Свои каналы/чаты владельца (для сопоставления GetCommonChats).
    const ownChats = await db
      .select()
      .from(telegramPostingChats)
      .where(eq(telegramPostingChats.userId, userId))

    // Словарь ключевых слов по чатам строим ОДИН раз на весь скан (не на
    // каждого лида) — не зависит от давности постов, см. комментарий в шапке.
    const vocabulary = await buildChatVocabulary(userId)

    for (const dialog of dialogs) {
      // Только личные диалоги (не группы/каналы), не боты, не Saved Messages.
      if (!dialog.isUser) continue
      const entity = dialog.entity as { bot?: boolean; self?: boolean; id?: unknown } | undefined
      if (entity?.bot) continue
      if (entity?.self) continue // Saved Messages

      const lastMessage = dialog.message
      if (!lastMessage) continue
      // Последнее сообщение диалога должно быть ВХОДЯЩИМ (не наше исходящее) —
      // иначе это мы написали первыми, не входящий лид.
      if (lastMessage.out) continue

      const lastDate = lastMessage.date ? new Date(lastMessage.date * 1000) : null
      if (!lastDate || lastDate.getTime() <= since.getTime()) continue

      result.dialogsChecked++

      const tgUserId = dialog.id?.toString()
      if (!tgUserId) continue

      try {
        const [existing] = await db
          .select({ id: telegramDmLeads.id })
          .from(telegramDmLeads)
          .where(and(eq(telegramDmLeads.userId, userId), eq(telegramDmLeads.tgUserId, tgUserId)))
          .limit(1)
        if (existing) continue // уже знаем этого лида

        // Первые сообщения диалога — берём самое раннее ВХОДЯЩЕЕ.
        const recentMessages = await client.getMessages(dialog.entity, { limit: 5 })
        const incoming = recentMessages.filter((m) => !m.out && m.message)
        if (incoming.length === 0) continue
        const earliest = incoming.reduce((a, b) => ((a.date ?? 0) <= (b.date ?? 0) ? a : b))
        const firstMessageAt = earliest.date ? new Date(earliest.date * 1000) : lastDate
        const firstMessageText = (earliest.message ?? "").slice(0, FIRST_MESSAGE_MAX_LEN)

        const userEntity = dialog.entity as { firstName?: string; lastName?: string; username?: string } | undefined
        const displayName = [userEntity?.firstName, userEntity?.lastName].filter(Boolean).join(" ") || null

        const { sourceChatId, sourceConfidence } = await resolveSource(
          client as unknown as { invoke: (req: unknown) => Promise<{ chats?: Array<{ id: unknown }> }> },
          dialog.entity,
          userId,
          firstMessageText,
          firstMessageAt,
          ownChats,
          vocabulary
        )

        await db.insert(telegramDmLeads).values({
          userId,
          tgUserId,
          tgUsername: userEntity?.username ?? null,
          displayName,
          firstMessageAt,
          firstMessageText: firstMessageText || null,
          sourceChatId,
          sourceConfidence,
        })
        result.newLeads++
      } catch (err) {
        // Ошибка по одному диалогу не должна прерывать сканирование остальных.
        console.error("[dm-leads] диалог", tgUserId, err)
        result.errors++
      }
    }

    await db
      .update(telegramUserbotSessions)
      .set({ dmLastCheckedAt: new Date(), updatedAt: new Date() })
      .where(eq(telegramUserbotSessions.userId, userId))
  } finally {
    await client.disconnect().catch(() => {})
  }

  return result
}

// getDialogs даёт «маркированные» peer id (-100… для каналов/супергрупп, -… для
// обычных групп), а GetCommonChats возвращает «чистые» положительные id —
// приводим к чистому виду для сравнения.
function unmarkPeerId(peerId: string): string {
  if (peerId.startsWith("-100")) return peerId.slice(4)
  if (peerId.startsWith("-")) return peerId.slice(1)
  return peerId
}

async function resolveSource(
  client: { invoke: (req: unknown) => Promise<{ chats?: Array<{ id: unknown }> }> },
  dialogEntity: unknown,
  userId: string,
  firstMessageText: string,
  firstMessageAt: Date,
  ownChats: Array<{ id: string; tgPeerId: string }>,
  vocabulary: Map<string, Set<string>>
): Promise<{ sourceChatId: string | null; sourceConfidence: string | null }> {
  // (а) Общие чаты с лидом — самый надёжный сигнал, не зависит от давности
  // поста (Telegram видит общую группу хоть спустя год после публикации).
  // GetCommonChats — сырой MTProto-вызов, ему нужен InputUser (id+access_hash
  // из entity диалога), голый id он не резолвит.
  let matchingOwnChatIds: string[] = []
  try {
    const ent = dialogEntity as { id?: unknown; accessHash?: unknown } | undefined
    if (ent?.id == null) throw new Error("нет entity у диалога")
    const inputUser = new Api.InputUser({
      userId: ent.id,
      accessHash: ent.accessHash ?? 0,
    } as unknown as ConstructorParameters<typeof Api.InputUser>[0])
    const common = await client.invoke(
      new Api.messages.GetCommonChats({ userId: inputUser, maxId: 0, limit: 100 } as unknown as ConstructorParameters<
        typeof Api.messages.GetCommonChats
      >[0])
    )
    const commonIds = new Set((common.chats ?? []).map((c) => String(c.id)))
    matchingOwnChatIds = ownChats.filter((c) => commonIds.has(unmarkPeerId(c.tgPeerId))).map((c) => c.id)
  } catch (err) {
    console.error("[dm-leads] GetCommonChats", err)
  }

  if (matchingOwnChatIds.length === 1) {
    return { sourceChatId: matchingOwnChatIds[0], sourceConfidence: "common_chat" }
  }
  if (matchingOwnChatIds.length > 1) {
    // Несколько общих чатов — пробуем разрешить неоднозначность по содержанию
    // сообщения (см. ниже), иначе берём самый активный из совпавших.
    const disambiguated = pickUnambiguousWinner(
      scoreChatsByKeywords(firstMessageText, vocabulary, new Set(matchingOwnChatIds))
    )
    const chatId = disambiguated ?? (await pickMostActiveChat(matchingOwnChatIds))
    if (chatId) return { sourceChatId: chatId, sourceConfidence: "common_chat" }
  }

  // (б) Сопоставление по содержанию — ключевые слова первого сообщения лида
  // против словаря постов чата. Тоже НЕ зависит от давности поста/активности
  // группы — работает и для поста месячной давности в "спящей" группе.
  const keywordWinner = pickUnambiguousWinner(scoreChatsByKeywords(firstMessageText, vocabulary))
  if (keywordWinner) {
    return { sourceChatId: keywordWinner, sourceConfidence: "keyword" }
  }

  // (в) Тайминг — САМЫЙ СЛАБЫЙ резерв, только если (а) и (б) ничего не дали.
  // Не работает для старых постов/неактивных групп — намеренно ограничен
  // коротким окном (см. TIMING_WINDOW_MS) и используется в последнюю очередь.
  const windowStart = new Date(firstMessageAt.getTime() - TIMING_WINDOW_MS)
  const [latestDelivery] = await db
    .select({ chatId: telegramPostDeliveries.chatId, sentAt: telegramPostDeliveries.sentAt })
    .from(telegramPostDeliveries)
    .innerJoin(telegramScheduledPosts, eq(telegramPostDeliveries.postId, telegramScheduledPosts.id))
    .where(
      and(
        eq(telegramScheduledPosts.userId, userId),
        eq(telegramPostDeliveries.status, "sent"),
        lte(telegramPostDeliveries.sentAt, firstMessageAt)
      )
    )
    .orderBy(desc(telegramPostDeliveries.sentAt))
    .limit(1)

  if (latestDelivery && latestDelivery.sentAt.getTime() >= windowStart.getTime()) {
    return { sourceChatId: latestDelivery.chatId, sourceConfidence: "timing" }
  }

  return { sourceChatId: null, sourceConfidence: null }
}
