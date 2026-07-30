// POST /api/modules/ai-rop/reports/schedules/[id]/run-now — ручной тестовый запуск
// расписания (то же самое, что делает cron ai-rop-reports). Доступ: requireRopTeam.
import { NextResponse } from "next/server"
import { apiError } from "@/lib/api-helpers"
import { requireRopTeam } from "@/lib/ai-rop/access"
import { getSchedule, runScheduled } from "@/lib/ai-rop/reports-scheduler"
import { getRopSettings, toBitrixConfig } from "@/lib/ai-rop/settings"

export const maxDuration = 60

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRopTeam()
    const { id } = await ctx.params
    if (!id) return apiError("id обязателен", 400)

    const schedule = await getSchedule(id, user.companyId)
    if (!schedule) return apiError("Не найдено", 404)

    const settingsRow = await getRopSettings(user.companyId)
    const bitrixConfig = toBitrixConfig(settingsRow)
    if (!bitrixConfig) return apiError("Bitrix не подключён", 400)

    const r = await runScheduled(schedule, bitrixConfig)
    return NextResponse.json(r)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/reports/schedules/:id/run-now] error:", err)
    return apiError("Internal server error", 500)
  }
}
