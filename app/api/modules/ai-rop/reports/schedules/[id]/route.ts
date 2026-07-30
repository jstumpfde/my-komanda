// PATCH /api/modules/ai-rop/reports/schedules/[id] — изменить расписание.
// DELETE — удалить. tenant-guard: расписание должно принадлежать companyId. Доступ: requireRopTeam.
import { NextResponse } from "next/server"
import { apiError } from "@/lib/api-helpers"
import { requireRopTeam } from "@/lib/ai-rop/access"
import {
  getSchedule,
  updateSchedule,
  deleteSchedule,
  type SchedulePatch,
  type ScheduleScope,
  type ScheduleRecipientKind,
  type ScheduleFrequency,
  type SchedulePeriodKind,
} from "@/lib/ai-rop/reports-scheduler"

const VALID_SCOPES: ScheduleScope[] = ["manager", "team"]
const VALID_RECIPIENT_KINDS: ScheduleRecipientKind[] = ["user", "chat"]
const VALID_FREQUENCIES: ScheduleFrequency[] = ["daily", "weekly"]
const VALID_PERIODS: SchedulePeriodKind[] = ["yesterday", "today", "last_7_days", "last_week", "this_week", "last_month"]
const TIME_RE = /^\d{2}:\d{2}$/

function safeParseDays(json: string | null): number[] {
  if (!json) return []
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v.filter((d) => Number.isFinite(d)) : []
  } catch {
    return []
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRopTeam()
    const { id } = await ctx.params
    if (!id) return apiError("id обязателен", 400)

    const existing = await getSchedule(id, user.companyId)
    if (!existing) return apiError("Не найдено", 404)

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const patch: SchedulePatch = {}

    if (body.name !== undefined) {
      const n = typeof body.name === "string" ? body.name.trim() : ""
      if (!n) return apiError("Укажите название", 400)
      patch.name = n
    }
    if (body.scope !== undefined) {
      const v = body.scope as ScheduleScope
      if (!VALID_SCOPES.includes(v)) return apiError("Неверный scope", 400)
      patch.scope = v
    }
    if (body.managerId !== undefined) {
      patch.managerId = typeof body.managerId === "string" && body.managerId.trim() ? body.managerId.trim() : null
    }
    if (body.recipientKind !== undefined) {
      const v = body.recipientKind as ScheduleRecipientKind
      if (!VALID_RECIPIENT_KINDS.includes(v)) return apiError("Неверный recipientKind", 400)
      patch.recipientKind = v
    }
    if (body.recipientId !== undefined) {
      const v = typeof body.recipientId === "string" ? body.recipientId.trim() : ""
      if (!v) return apiError("Укажите получателя", 400)
      patch.recipientId = v
    }
    if (body.recipientName !== undefined) {
      patch.recipientName = typeof body.recipientName === "string" && body.recipientName.trim() ? body.recipientName.trim() : null
    }
    if (body.frequency !== undefined) {
      const v = body.frequency as ScheduleFrequency
      if (!VALID_FREQUENCIES.includes(v)) return apiError("Неверная частота", 400)
      patch.frequency = v
    }
    if (body.time !== undefined) {
      const v = typeof body.time === "string" ? body.time.trim() : ""
      if (!TIME_RE.test(v)) return apiError("Время должно быть в формате HH:MM", 400)
      patch.time = v
    }
    if (body.daysOfWeek !== undefined) {
      const arr = Array.isArray(body.daysOfWeek)
        ? (body.daysOfWeek as unknown[]).map((d) => (typeof d === "number" ? d : parseInt(String(d), 10))).filter((d) => Number.isFinite(d) && d >= 1 && d <= 7)
        : []
      patch.daysOfWeek = arr.length > 0 ? arr : null
    }
    if (body.periodKind !== undefined) {
      const v = body.periodKind as SchedulePeriodKind
      if (!VALID_PERIODS.includes(v)) return apiError("Неверный period", 400)
      patch.periodKind = v
    }
    if (body.enabled !== undefined) patch.enabled = !!body.enabled

    const finalScope = patch.scope ?? (existing.scope as ScheduleScope)
    const finalManagerId = patch.managerId !== undefined ? patch.managerId : existing.managerId
    if (finalScope === "manager" && !finalManagerId) return apiError("Для отчёта по менеджеру нужно указать managerId", 400)

    const finalFreq = patch.frequency ?? (existing.frequency as ScheduleFrequency)
    const finalDays = patch.daysOfWeek !== undefined ? patch.daysOfWeek : safeParseDays(existing.daysOfWeek)
    if (finalFreq === "weekly" && (!finalDays || finalDays.length === 0)) {
      return apiError("Для еженедельной отправки выберите хотя бы один день недели", 400)
    }

    const item = await updateSchedule(id, user.companyId, patch)
    if (!item) return apiError("Не найдено", 404)
    return NextResponse.json({ ok: true, item })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/reports/schedules/:id] PATCH error:", err)
    return apiError("Internal server error", 500)
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRopTeam()
    const { id } = await ctx.params
    if (!id) return apiError("id обязателен", 400)

    const existing = await getSchedule(id, user.companyId)
    if (!existing) return apiError("Не найдено", 404)

    await deleteSchedule(id, user.companyId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/reports/schedules/:id] DELETE error:", err)
    return apiError("Internal server error", 500)
  }
}
