// GET /api/modules/ai-rop/reports/schedules — список расписаний компании.
// POST — создать новое расписание. Доступ: requireRopTeam.
import { NextResponse } from "next/server"
import { apiError } from "@/lib/api-helpers"
import { requireRopTeam } from "@/lib/ai-rop/access"
import {
  listSchedules,
  createSchedule,
  type ScheduleInput,
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

export async function GET() {
  try {
    const user = await requireRopTeam()
    const items = await listSchedules(user.companyId)
    return NextResponse.json({ ok: true, items })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/reports/schedules] GET error:", err)
    return apiError("Internal server error", 500)
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRopTeam()
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>

    const name = typeof body.name === "string" ? body.name.trim() : ""
    const scope = body.scope as ScheduleScope | undefined
    const managerId = typeof body.managerId === "string" && body.managerId.trim() ? body.managerId.trim() : null
    const recipientKind = body.recipientKind as ScheduleRecipientKind | undefined
    const recipientId = typeof body.recipientId === "string" ? body.recipientId.trim() : ""
    const recipientName = typeof body.recipientName === "string" && body.recipientName.trim() ? body.recipientName.trim() : null
    const frequency = body.frequency as ScheduleFrequency | undefined
    const time = typeof body.time === "string" ? body.time.trim() : ""
    const periodKind = body.periodKind as SchedulePeriodKind | undefined
    const daysOfWeek = Array.isArray(body.daysOfWeek)
      ? (body.daysOfWeek as unknown[]).map((d) => (typeof d === "number" ? d : parseInt(String(d), 10))).filter((d) => Number.isFinite(d) && d >= 1 && d <= 7)
      : []

    if (!name) return apiError("Укажите название", 400)
    if (!scope || !VALID_SCOPES.includes(scope)) return apiError("Неверный scope", 400)
    if (scope === "manager" && !managerId) return apiError("Для отчёта по менеджеру нужно указать managerId", 400)
    if (!recipientKind || !VALID_RECIPIENT_KINDS.includes(recipientKind)) return apiError("Неверный recipientKind", 400)
    if (!recipientId) return apiError("Укажите получателя", 400)
    if (!frequency || !VALID_FREQUENCIES.includes(frequency)) return apiError("Неверная частота", 400)
    if (!TIME_RE.test(time)) return apiError("Время должно быть в формате HH:MM", 400)
    if (frequency === "weekly" && daysOfWeek.length === 0) return apiError("Для еженедельной отправки выберите хотя бы один день недели", 400)
    if (!periodKind || !VALID_PERIODS.includes(periodKind)) return apiError("Неверный period", 400)

    const input: ScheduleInput = {
      tenantId: user.companyId,
      name,
      scope,
      managerId,
      recipientKind,
      recipientId,
      recipientName,
      frequency,
      time,
      daysOfWeek: frequency === "weekly" ? daysOfWeek : null,
      periodKind,
      enabled: true,
    }

    const item = await createSchedule(input)
    return NextResponse.json({ ok: true, item })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/reports/schedules] POST error:", err)
    return apiError("Internal server error", 500)
  }
}
