// Zoom Meetings API — создание встречи от имени владельца токена.

const API_BASE = "https://api.zoom.us/v2"

export interface CreateMeetingParams {
  topic: string
  startAt: Date
  endAt: Date
}

export interface CreatedZoomMeeting {
  joinUrl: string
  meetingId: number
}

export async function createZoomMeeting(
  accessToken: string,
  { topic, startAt, endAt }: CreateMeetingParams,
): Promise<CreatedZoomMeeting> {
  const durationMinutes = Math.max(15, Math.round((endAt.getTime() - startAt.getTime()) / 60000))
  const res = await fetch(`${API_BASE}/users/me/meetings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      topic: topic.slice(0, 200),
      type: 2, // scheduled meeting
      start_time: startAt.toISOString(),
      duration: durationMinutes,
      timezone: "UTC",
      settings: {
        join_before_host: true,
        waiting_room: false,
        approval_type: 2, // без регистрации
      },
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Zoom create meeting error ${res.status}: ${text.slice(0, 300)}`)
  }
  const data = await res.json()
  return { joinUrl: data.join_url as string, meetingId: data.id as number }
}
