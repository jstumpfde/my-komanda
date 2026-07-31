/**
 * Свёртка привязанных сообщений (rop_messages) одной сделки-нити в «эпизод»
 * (rop_calls) — раздел B, шаг 7 плана SalesRadar. Это и есть точка strangler-
 * шва: после rollup существующий pipeline.ts/analyzer.ts работает БЕЗ правок,
 * как будто это обычное email/chat-взаимодействие.
 *
 * Границы эпизода — что бы ни случилось раньше:
 *   - debounce: 5 минут без новых linked-сообщений этой нити в этом threadKey;
 *   - ИЛИ 20 сообщений в незакрытом эпизоде;
 *   - ИЛИ смена календарного дня (по sentAt, локально не важно — сравниваем UTC-дату).
 *
 * Сообщения rop_messages.attributionStatus='linked' и ещё не свёрнутые
 * (interactionId IS NULL) собираются по (companyId, dealThreadId, threadKey),
 * группируются в последовательные эпизоды по границам выше, каждый эпизод
 * идёт в saveInteraction() как один диалог с ролями (МЫ/КЛИЕНТ).
 *
 * ГОТЧА: interaction-source.ts (lib/ai-rop/interaction-source.ts) — чужая
 * зона (лежит в lib/ai-rop, не в lib/salesradar), поэтому не редактирую его.
 * saveInteraction() не знает про connectorId/counterpartyId/dealThreadId
 * (rop_calls получил эти 3 nullable-колонки уже ПОСЛЕ того, как контракт
 * interaction-source.ts был заморожен) — дозаполняю их отдельным UPDATE сразу
 * после вставки, и создаю rop_message_deal_links(interactionId=...) для
 * аудита (какие сообщения свернулись в какой эпизод).
 */
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  ropMessages,
  ropChannelConnectors,
  ropCalls,
  ropMessageDealLinks,
  type RopMessage,
} from "@/lib/db/schema"
import { saveInteraction } from "@/lib/ai-rop/interaction-source"
import type { InteractionChannel } from "@/lib/ai-rop/types"
import type { ConnectorKind } from "./types"

const DEBOUNCE_MS = 5 * 60_000
const MAX_MESSAGES_PER_EPISODE = 20

export interface RollupResult {
  episodesCreated: number
  messagesRolled: number
  skippedIncomplete: number // группы, ещё ждущие debounce (не трогаем)
}

const CONNECTOR_KIND_TO_CHANNEL: Record<ConnectorKind, InteractionChannel> = {
  imap: "email_imap",
  telegram_bot: "telegram",
  telegram_user: "telegram",
  whatsapp_agg: "whatsapp",
  vk: "other",
  avito: "other",
  bitrix: "openlines",
}

function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Разбить хронологически отсортированные сообщения одной нити на эпизоды по границам debounce/лимит/день. */
export function splitIntoEpisodes(messages: RopMessage[]): RopMessage[][] {
  const episodes: RopMessage[][] = []
  let current: RopMessage[] = []

  for (const m of messages) {
    if (current.length === 0) {
      current.push(m)
      continue
    }
    const prev = current[current.length - 1]
    const gapMs = m.sentAt.getTime() - prev.sentAt.getTime()
    const dayChanged = utcDateKey(m.sentAt) !== utcDateKey(prev.sentAt)
    const tooLong = current.length >= MAX_MESSAGES_PER_EPISODE
    if (gapMs > DEBOUNCE_MS || dayChanged || tooLong) {
      episodes.push(current)
      current = [m]
    } else {
      current.push(m)
    }
  }
  if (current.length) episodes.push(current)
  return episodes
}

function formatDialogue(messages: RopMessage[]): string {
  return messages
    .map((m) => `[${m.sentAt.toISOString()}] ${m.isOurs ? "МЫ" : "КЛИЕНТ"}${m.authorName ? ` (${m.authorName})` : ""}: ${m.text ?? "(без текста)"}`)
    .join("\n")
}

/**
 * Является ли последний эпизод группы "закрытым" (готовым к свёртке)? Открыт,
 * если с последнего сообщения ещё не прошло DEBOUNCE_MS и лимит по размеру не
 * достигнут, и это ещё текущий день — тогда ждём, вдруг придут ещё сообщения.
 */
function isEpisodeClosed(episode: RopMessage[], now: Date): boolean {
  const last = episode[episode.length - 1]
  const idleMs = now.getTime() - last.sentAt.getTime()
  if (idleMs > DEBOUNCE_MS) return true
  if (episode.length >= MAX_MESSAGES_PER_EPISODE) return true
  if (utcDateKey(last.sentAt) !== utcDateKey(now)) return true
  return false
}

/**
 * Свернуть linked-сообщения одной компании в эпизоды rop_calls. Работает по
 * группам (dealThreadId, threadKey) — сообщения одной нити в одном чате.
 * budgetMs — мягкий таймбюджет (крон делит его с attribution.ts).
 */
export async function rollupCompanyMessages(companyId: string, opts: { budgetMs?: number } = {}): Promise<RollupResult> {
  const budgetMs = opts.budgetMs ?? 15_000
  const t0 = Date.now()
  const now = new Date()

  const pendingRows = await db
    .select({
      dealThreadId: ropMessageDealLinks.dealThreadId,
      threadKey: ropMessages.threadKey,
    })
    .from(ropMessages)
    .innerJoin(
      ropMessageDealLinks,
      and(eq(ropMessageDealLinks.messageId, ropMessages.id), sql`${ropMessageDealLinks.supersededById} IS NULL`)
    )
    .where(and(eq(ropMessages.companyId, companyId), eq(ropMessages.attributionStatus, "linked"), isNull(ropMessages.interactionId)))
    .groupBy(ropMessageDealLinks.dealThreadId, ropMessages.threadKey)

  const result: RollupResult = { episodesCreated: 0, messagesRolled: 0, skippedIncomplete: 0 }

  for (const group of pendingRows) {
    if (Date.now() - t0 > budgetMs) break

    // Два простых select вместо join с select() без явных полей — не полагаемся
    // на неоднозначную форму объекта результата join'а (в кодовой базе нет
    // прецедента "select({alias: table})" с целой таблицей под ключом).
    const linkedIds = await db
      .select({ messageId: ropMessageDealLinks.messageId })
      .from(ropMessageDealLinks)
      .where(and(eq(ropMessageDealLinks.dealThreadId, group.dealThreadId), sql`${ropMessageDealLinks.supersededById} IS NULL`))
    const ids = linkedIds.map((r) => r.messageId).filter((id): id is string => !!id)
    if (!ids.length) continue

    const messages = ids.length
      ? await db
          .select()
          .from(ropMessages)
          .where(
            and(
              eq(ropMessages.companyId, companyId),
              eq(ropMessages.threadKey, group.threadKey),
              eq(ropMessages.attributionStatus, "linked"),
              isNull(ropMessages.interactionId),
              inArray(ropMessages.id, ids)
            )
          )
          .orderBy(asc(ropMessages.sentAt))
      : []

    if (!messages.length) continue

    const episodes = splitIntoEpisodes(messages)
    for (const episode of episodes) {
      if (!isEpisodeClosed(episode, now)) {
        result.skippedIncomplete++
        continue // ждём ещё сообщений/debounce — следующий тик крона доберёт
      }

      const first = episode[0]
      const [connector] = await db.select().from(ropChannelConnectors).where(eq(ropChannelConnectors.id, first.connectorId)).limit(1)
      const channel: InteractionChannel = connector ? CONNECTOR_KIND_TO_CHANNEL[connector.kind as ConnectorKind] ?? "other" : "other"

      const dialogue = formatDialogue(episode)
      // Идемпотентность: externalId эпизода = threadKey + время первого сообщения (стабильно между запусками).
      const episodeExternalId = `${first.threadKey}:${first.sentAt.toISOString()}`

      const interactionId = await saveInteraction({
        externalId: episodeExternalId,
        companyId,
        type: "chat",
        channel,
        contentText: dialogue,
        startedAt: first.sentAt.toISOString(),
        durationSec: Math.max(0, Math.round((episode[episode.length - 1].sentAt.getTime() - first.sentAt.getTime()) / 1000)),
        initialStatus: "pending",
      })

      if (!interactionId) {
        // saveInteraction идемпотентен по (tenantId, bitrixCallId=channel:externalId) — уже существует.
        // Всё равно проставим messages/links, чтобы не зависать в цикле повторной обработки.
        console.warn(`[salesradar/rollup] эпизод ${episodeExternalId} уже существовал в rop_calls, дозаполняю привязки без повторной вставки`)
      }

      // Денормализация в rop_calls (connectorId/counterpartyId/dealThreadId) — эти 3 колонки
      // interaction-source.ts не знает, дозаполняем отдельно (см. docblock файла).
      if (interactionId) {
        await db
          .update(ropCalls)
          .set({ connectorId: first.connectorId, counterpartyId: first.counterpartyId, dealThreadId: group.dealThreadId })
          .where(eq(ropCalls.id, interactionId))
      }

      const targetInteractionId =
        interactionId ??
        (
          await db
            .select({ id: ropCalls.id })
            .from(ropCalls)
            .where(and(eq(ropCalls.tenantId, companyId), eq(ropCalls.bitrixCallId, `${channel}:${episodeExternalId}`)))
            .limit(1)
        )[0]?.id ??
        null

      for (const m of episode) {
        await db.update(ropMessages).set({ interactionId: targetInteractionId }).where(eq(ropMessages.id, m.id))
        await db
          .update(ropMessageDealLinks)
          .set({ interactionId: targetInteractionId })
          .where(and(eq(ropMessageDealLinks.messageId, m.id), sql`${ropMessageDealLinks.supersededById} IS NULL`))
      }

      result.episodesCreated++
      result.messagesRolled += episode.length
    }
  }

  return result
}
