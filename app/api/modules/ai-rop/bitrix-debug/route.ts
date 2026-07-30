// GET /api/modules/ai-rop/bitrix-debug — диагностика: разбивка crm.activity.list
// компании по TYPE_ID/PROVIDER_ID за последние 30 дней (помогает понять, почему
// импорт email/чатов вернул 0). Доступ: requireRopTeam.
import { NextResponse } from "next/server"
import { apiError } from "@/lib/api-helpers"
import { requireRopTeam } from "@/lib/ai-rop/access"
import { getRopSettings, toBitrixConfig } from "@/lib/ai-rop/settings"
import { createBitrixClient } from "@/lib/ai-rop/bitrix"

export const maxDuration = 60

interface ActivityShort {
  ID: string
  TYPE_ID: string
  PROVIDER_ID: string
  PROVIDER_TYPE_ID: string
  SUBJECT: string
  CREATED: string
  DIRECTION: string
}

const TYPE_LABELS: Record<string, string> = {
  "1": "Встреча (TYPE_ID=1)",
  "2": "Звонок (TYPE_ID=2)",
  "3": "Задача (TYPE_ID=3)",
  "4": "Email (TYPE_ID=4)",
  "5": "Другое (TYPE_ID=5)",
  "6": "Open Lines / прочее (TYPE_ID=6)",
}

export async function GET() {
  try {
    const user = await requireRopTeam()

    const settingsRow = await getRopSettings(user.companyId)
    const bitrixConfig = toBitrixConfig(settingsRow)
    if (!bitrixConfig) return apiError("Bitrix не подключён", 400)
    const client = createBitrixClient(bitrixConfig)

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const since = thirtyDaysAgo.toISOString()

    const activities = await client.call<ActivityShort[]>("crm.activity.list", {
      filter: { ">=CREATED": since },
      order: { CREATED: "DESC" },
      select: ["ID", "TYPE_ID", "PROVIDER_ID", "PROVIDER_TYPE_ID", "SUBJECT", "CREATED", "DIRECTION"],
    })

    const byType: Record<string, number> = {}
    const byProvider: Record<string, number> = {}
    const samples: Record<string, ActivityShort> = {}

    for (const a of activities) {
      const t = a.TYPE_ID || "?"
      const p = a.PROVIDER_ID || "(empty)"
      byType[t] = (byType[t] ?? 0) + 1
      byProvider[p] = (byProvider[p] ?? 0) + 1
      const key = `${t}:${p}`
      if (!samples[key]) samples[key] = a
    }

    return NextResponse.json({
      ok: true,
      period: { since, totalActivities: activities.length },
      byType: Object.entries(byType)
        .sort((a, b) => b[1] - a[1])
        .map(([id, count]) => ({ typeId: id, label: TYPE_LABELS[id] || `Неизвестно (${id})`, count })),
      byProvider: Object.entries(byProvider)
        .sort((a, b) => b[1] - a[1])
        .map(([providerId, count]) => ({ providerId, count })),
      samples: Object.entries(samples).map(([key, a]) => ({
        key,
        id: a.ID,
        subject: a.SUBJECT?.slice(0, 80) || null,
        created: a.CREATED,
        direction: a.DIRECTION,
      })),
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/bitrix-debug] error:", err)
    return apiError("Internal server error", 500)
  }
}
