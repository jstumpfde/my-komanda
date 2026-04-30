import { addDays } from "date-fns"
import { FOLLOWUP_PRESETS, type FollowUpPreset } from "./presets"

export interface ScheduledTouch {
  campaignId: string
  candidateId: string
  scheduledAt: Date
  touchNumber: number
  channel: "hh"
  messageText: string
  status: "pending"
}

export function generateTouchSchedule(
  campaignId: string,
  candidateId: string,
  preset: FollowUpPreset,
  startDate: Date,
  messages: string[],
): ScheduledTouch[] {
  if (preset === "off") return []
  const schedule = FOLLOWUP_PRESETS[preset]
  if (!schedule || schedule.days.length === 0) return []
  if (messages.length === 0) return []

  return schedule.days.map((dayOffset, idx) => ({
    campaignId,
    candidateId,
    scheduledAt: addDays(startDate, dayOffset),
    touchNumber: idx + 1,
    channel: "hh" as const,
    messageText: messages[idx] ?? messages[messages.length - 1] ?? "",
    status: "pending" as const,
  }))
}
