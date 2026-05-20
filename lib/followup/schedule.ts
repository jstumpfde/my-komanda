import { addDays } from "date-fns"
import { FOLLOWUP_PRESETS, FOLLOWUP_MESSAGE_SLOTS, type FollowUpPreset } from "./presets"

export type FollowUpBranch = "not_opened" | "opened_not_finished"

export interface ScheduledTouch {
  campaignId: string
  candidateId: string
  scheduledAt: Date
  touchNumber: number
  channel: "hh"
  messageText: string
  status: "pending"
  branch: FollowUpBranch
}

// Готовит массив длиной FOLLOWUP_MESSAGE_SLOTS, в котором пустые слоты
// подменены дефолтами. Нужен потому что preset.messageIndexes может
// ссылаться на любой слот 0..8, а кастомные значения из БД могут быть
// короче (старые значения soft из БД были массивом 5/7/10 строк).
export function mergeMessagesWithDefaults(
  custom:   readonly string[] | null | undefined,
  defaults: readonly string[],
): string[] {
  const out: string[] = []
  for (let i = 0; i < FOLLOWUP_MESSAGE_SLOTS; i++) {
    const v = custom?.[i]
    if (typeof v === "string" && v.length > 0) {
      out.push(v)
    } else {
      out.push(defaults[i] ?? defaults[defaults.length - 1] ?? "")
    }
  }
  return out
}

export function generateTouchSchedule(
  campaignId:  string,
  candidateId: string,
  preset:      FollowUpPreset,
  startDate:   Date,
  messages:    string[],
  branch:      FollowUpBranch = "not_opened",
): ScheduledTouch[] {
  if (preset === "off") return []
  const schedule = FOLLOWUP_PRESETS[preset]
  if (!schedule || schedule.days.length === 0) return []
  if (messages.length === 0) return []

  return schedule.days.map((dayOffset, idx) => {
    const slot = schedule.messageIndexes[idx] ?? idx
    const text = messages[slot] ?? messages[messages.length - 1] ?? ""
    return {
      campaignId,
      candidateId,
      scheduledAt: addDays(startDate, dayOffset),
      touchNumber: idx + 1,
      channel:     "hh" as const,
      messageText: text,
      status:      "pending" as const,
      branch,
    }
  })
}
