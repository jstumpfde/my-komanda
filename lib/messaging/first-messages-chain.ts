// #21: планирование Сообщений 2 и 3 серии первых сообщений.
//
// process-queue.ts отправляет Сообщение 1 синхронно (changeNegotiationState
// с действием "invitation"). Если у вакансии заполнен first_messages_chain
// и Сообщение 2/3 включены — этот helper создаёт записи в follow_up_messages
// с branch='first_msg_2'/'first_msg_3' и cumulative scheduled_at.
//
// Cron /api/cron/follow-up подберёт их и отправит через hh-чат. Стоп-отмена
// (scan-incoming.ts) при ответе кандидата работает out-of-the-box —
// апдейт идёт по candidateId без фильтра по branch, поэтому chain
// прерывается. Дополнительно cron-обработчик проверяет:
//   - вакансия не закрыта
//   - кандидат не в стадии rejected/hired
//   - кандидат ещё не открыл демо (demoOpenedAt IS NULL) — иначе
//     дальнейшие сообщения теряют смысл.

import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { followUpCampaigns, followUpMessages, vacancies } from "@/lib/db/schema"
import { DEFAULT_FIRST_MESSAGE_DELAY_SECONDS } from "@/lib/hh/default-messages"

export interface ChainStep {
  enabled:      boolean
  delaySeconds: number
  text:         string
}

// «Человеческая» пауза перед ПЕРВЫМ сообщением (сек): своя на вакансии
// (firstMessagesChain[0].delaySeconds) или дефолт. Дефолт НЕ хардкод — caller
// передаёт эффективный (платформа→компания) через fallbackSeconds; код-константа
// DEFAULT_FIRST_MESSAGE_DELAY_SECONDS остаётся лишь последним сидом.
export function firstMessageDelaySeconds(
  chain: unknown,
  fallbackSeconds: number = DEFAULT_FIRST_MESSAGE_DELAY_SECONDS,
): number {
  const c = Array.isArray(chain) ? chain : []
  const first = c[0] as { delaySeconds?: unknown } | undefined
  const d = first && typeof first.delaySeconds === "number" ? first.delaySeconds : null
  return d ?? fallbackSeconds
}

// Свежий отклик ещё не дорос до задержки → отложить обработку (process-queue
// оставит status='response', следующий cron подберёт). Старые/повторные —
// проходят сразу. Используется в lib/hh/process-queue.ts (рабочее время).
export function shouldDeferFirstMessage(
  createdAt: Date | string | null | undefined,
  chain: unknown,
  now: Date,
  fallbackSeconds: number = DEFAULT_FIRST_MESSAGE_DELAY_SECONDS,
): boolean {
  if (!createdAt) return false
  const delaySec = firstMessageDelaySeconds(chain, fallbackSeconds)
  if (delaySec <= 0) return false
  const ageMs = now.getTime() - new Date(createdAt).getTime()
  return ageMs < delaySec * 1000
}

const CHAIN_BRANCH_BY_INDEX: Record<number, string> = {
  1: "first_msg_2",
  2: "first_msg_3",
}

// Branch для мягкого Сообщения 1 в нерабочее время. Cron /api/cron/follow-up
// отправляет это сообщение даже вне рабочего окна (canSendNow=false) — в этом
// весь смысл off-hours-ветки. См. scheduleOffHoursFirstMessage ниже.
export const OFF_HOURS_FIRST_BRANCH = "first_msg_offhours"

// Кампания нужна, потому что follow_up_messages.campaign_id NOT NULL.
// Если кампании ещё нет — создаём отключённую "off".
async function ensureCampaign(vacancyId: string): Promise<string | null> {
  const [existing] = await db
    .select({ id: followUpCampaigns.id })
    .from(followUpCampaigns)
    .where(eq(followUpCampaigns.vacancyId, vacancyId))
    .limit(1)
  if (existing) return existing.id
  const [created] = await db
    .insert(followUpCampaigns)
    .values({
      vacancyId,
      preset:              "off",
      enabled:             false,
      stopOnReply:         true,
      stopOnVacancyClosed: true,
    })
    .returning({ id: followUpCampaigns.id })
  return created?.id ?? null
}

export async function scheduleFirstMessagesChain(args: {
  candidateId: string
  vacancyId:   string
  /** Базовая точка для cumulative задержек — обычно момент отправки Msg 1. */
  baseAt?:     Date
}): Promise<{ scheduled: number; reason?: string }> {
  try {
    const [vac] = await db
      .select({ chain: vacancies.firstMessagesChain })
      .from(vacancies)
      .where(eq(vacancies.id, args.vacancyId))
      .limit(1)
    if (!vac) return { scheduled: 0, reason: "vacancy_not_found" }
    const chain = Array.isArray(vac.chain) ? vac.chain as ChainStep[] : []
    if (chain.length < 2) return { scheduled: 0, reason: "no_chain" }

    const campaignId = await ensureCampaign(args.vacancyId)
    if (!campaignId) return { scheduled: 0, reason: "campaign_upsert_failed" }

    const baseAt = args.baseAt ?? new Date()
    let cumulativeMs = 0
    let scheduled = 0

    // chain[0] = Сообщение 1 — оно уже отправлено process-queue'ом
    // синхронно. Здесь только msg2 и msg3.
    for (let i = 1; i < Math.min(chain.length, 3); i++) {
      const step = chain[i]
      cumulativeMs += Math.max(0, Number(step.delaySeconds) || 0) * 1000
      if (!step.enabled) continue
      if (!step.text || !step.text.trim()) continue

      // Дедуп — если уже есть pending для этого candidate+branch.
      const branch = CHAIN_BRANCH_BY_INDEX[i] ?? `first_msg_${i + 1}`
      const [existing] = await db
        .select({ id: followUpMessages.id })
        .from(followUpMessages)
        .where(and(
          eq(followUpMessages.candidateId, args.candidateId),
          eq(followUpMessages.branch, branch),
          eq(followUpMessages.status, "pending"),
        ))
        .limit(1)
      if (existing) continue

      const scheduledAt = new Date(baseAt.getTime() + cumulativeMs)
      await db.insert(followUpMessages).values({
        campaignId,
        candidateId:  args.candidateId,
        scheduledAt,
        touchNumber:  0,
        channel:      "hh",
        messageText:  step.text,
        status:       "pending",
        branch,
      })
      scheduled++

      console.log("[first-messages-chain]", JSON.stringify({
        tag:         "first-messages-chain/schedule",
        candidateId: args.candidateId,
        vacancyId:   args.vacancyId,
        branch,
        scheduledAt: scheduledAt.toISOString(),
        delaySeconds: step.delaySeconds,
      }))
    }

    return { scheduled }
  } catch (err) {
    console.error("[first-messages-chain] schedule failed:", err instanceof Error ? err.message : err)
    return { scheduled: 0, reason: "exception" }
  }
}

// Off-hours: планирует одно «мягкое» Сообщение 1 для кандидата, откликнувшегося
// вне рабочих часов вакансии (вместо демо-приглашения и Сообщений 2/3).
// Текст сохраняется «как есть» (с плейсхолдерами {{name}}/{{vacancy}}/...) —
// cron /api/cron/follow-up рендерит их при отправке и шлёт даже вне окна.
export async function scheduleOffHoursFirstMessage(args: {
  candidateId:  string
  vacancyId:    string
  text:         string
  delaySeconds: number
}): Promise<{ scheduled: boolean; reason?: string }> {
  try {
    const text = (args.text ?? "").trim()
    if (!text) return { scheduled: false, reason: "empty_text" }

    const campaignId = await ensureCampaign(args.vacancyId)
    if (!campaignId) return { scheduled: false, reason: "campaign_upsert_failed" }

    // Дедуп: одно off-hours-сообщение на кандидата (pending или уже sent).
    const [existing] = await db
      .select({ id: followUpMessages.id })
      .from(followUpMessages)
      .where(and(
        eq(followUpMessages.candidateId, args.candidateId),
        eq(followUpMessages.branch, OFF_HOURS_FIRST_BRANCH),
      ))
      .limit(1)
    if (existing) return { scheduled: false, reason: "already_scheduled" }

    const delay = Math.max(0, Number(args.delaySeconds) || 0)
    const scheduledAt = new Date(Date.now() + delay * 1000)
    await db.insert(followUpMessages).values({
      campaignId,
      candidateId: args.candidateId,
      scheduledAt,
      touchNumber: 0,
      channel:     "hh",
      messageText: text,
      status:      "pending",
      branch:      OFF_HOURS_FIRST_BRANCH,
    })

    console.log("[first-messages-chain] off-hours", JSON.stringify({
      tag:          "first-messages-chain/off-hours",
      candidateId:  args.candidateId,
      vacancyId:    args.vacancyId,
      scheduledAt:  scheduledAt.toISOString(),
      delaySeconds: delay,
    }))
    return { scheduled: true }
  } catch (err) {
    console.error("[first-messages-chain] off-hours schedule failed:", err instanceof Error ? err.message : err)
    return { scheduled: false, reason: "exception" }
  }
}
