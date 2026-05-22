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

export interface ChainStep {
  enabled:      boolean
  delaySeconds: number
  text:         string
}

const CHAIN_BRANCH_BY_INDEX: Record<number, string> = {
  1: "first_msg_2",
  2: "first_msg_3",
}

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
