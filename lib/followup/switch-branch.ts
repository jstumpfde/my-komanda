// Переключение ветки дожима для кандидата при открытии демо.
//
// Когда кандидат открывает /demo/<shortId> впервые (см. visit/route.ts),
// он переходит из 'primary_contact' в 'demo_opened'. Касания ветки А
// (not_opened) больше не актуальны — текст уговаривает «откройте демо»,
// а кандидат уже открыл. Заменяем pending-касания ветки А на касания
// ветки Б (opened_not_finished).
//
// Логика:
//   1. Найти активную follow_up_campaigns для вакансии кандидата.
//   2. Если её нет / preset='off' / enabled=false — выйти.
//   3. Отменить (status='cancelled', errorMessage='branch_switched')
//      все pending follow_up_messages этого кандидата с branch='not_opened'.
//   4. Сгенерировать новый набор касаний ветки Б, начиная от текущего
//      момента (с теми же day-offset, что и preset).

import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { followUpCampaigns, followUpMessages, candidates } from "@/lib/db/schema"
import { isFollowUpPreset } from "./presets"
import { generateTouchSchedule, mergeMessagesWithDefaults } from "./schedule"
import { DEFAULT_FOLLOWUP_OPENED_NOT_FINISHED } from "./default-messages"

export async function switchToBranchOpened(candidateId: string): Promise<{
  switched: boolean
  cancelledA: number
  scheduledB: number
  reason?: string
}> {
  const [cand] = await db
    .select({ vacancyId: candidates.vacancyId })
    .from(candidates)
    .where(eq(candidates.id, candidateId))
    .limit(1)
  if (!cand) return { switched: false, cancelledA: 0, scheduledB: 0, reason: "candidate_not_found" }

  const [campaign] = await db
    .select()
    .from(followUpCampaigns)
    .where(and(
      eq(followUpCampaigns.vacancyId, cand.vacancyId),
      eq(followUpCampaigns.enabled, true),
    ))
    .limit(1)
  if (!campaign) return { switched: false, cancelledA: 0, scheduledB: 0, reason: "no_active_campaign" }
  if (!isFollowUpPreset(campaign.preset) || campaign.preset === "off") {
    return { switched: false, cancelledA: 0, scheduledB: 0, reason: "preset_off" }
  }

  // Шаг 1: отменить ветку А.
  const cancelled = await db
    .update(followUpMessages)
    .set({ status: "cancelled", errorMessage: "branch_switched" })
    .where(and(
      eq(followUpMessages.candidateId, candidateId),
      eq(followUpMessages.branch, "not_opened"),
      eq(followUpMessages.status, "pending"),
    ))
    .returning({ id: followUpMessages.id })

  // Шаг 2: запланировать ветку Б.
  // mergeMessagesWithDefaults гарантирует массив длиной FOLLOWUP_MESSAGE_SLOTS,
  // чтобы preset.messageIndexes мог адресовать любой слот 0..8.
  const messagesB = mergeMessagesWithDefaults(campaign.customMessagesOpened, DEFAULT_FOLLOWUP_OPENED_NOT_FINISHED)
  const touchesB = generateTouchSchedule(
    campaign.id,
    candidateId,
    campaign.preset,
    new Date(),
    messagesB,
    "opened_not_finished",
  )
  let scheduled = 0
  if (touchesB.length > 0) {
    const inserted = await db.insert(followUpMessages).values(touchesB).returning({ id: followUpMessages.id })
    scheduled = inserted.length
  }

  return { switched: true, cancelledA: cancelled.length, scheduledB: scheduled }
}
