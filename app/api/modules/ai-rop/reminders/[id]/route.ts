// PATCH /api/modules/ai-rop/reminders/[id] { action: "done" | "snooze", hours?: number }
// Только владелец-менеджер (rop_reminders.bitrixManagerId === свой manager scope)
// либо директор/head/rop_view_team может менять чужое напоминание команды.
import { NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropReminders } from "@/lib/db/schema"
import { apiError, requireCompany } from "@/lib/api-helpers"
import { ropCanViewTeam, ropManagerScope } from "@/lib/ai-rop/access"
import { markReminderDone, snoozeReminder } from "@/lib/ai-rop/reminders"

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompany()
    const { id } = await ctx.params
    if (!id) return apiError("id обязателен", 400)

    const [reminder] = await db
      .select({ bitrixManagerId: ropReminders.bitrixManagerId })
      .from(ropReminders)
      .where(and(eq(ropReminders.id, id), eq(ropReminders.tenantId, user.companyId)))
      .limit(1)
    if (!reminder) return apiError("Напоминание не найдено", 404)

    if (!ropCanViewTeam(user)) {
      const myBitrixId = await ropManagerScope(user)
      if (!myBitrixId || myBitrixId !== reminder.bitrixManagerId) {
        return apiError("Можно менять только свои напоминания", 403)
      }
    }

    const body = (await req.json().catch(() => ({}))) as { action?: "done" | "snooze"; hours?: number }
    if (body.action === "done") {
      await markReminderDone(id, user.companyId)
    } else if (body.action === "snooze") {
      await snoozeReminder(id, user.companyId, Math.max(1, body.hours ?? 24))
    } else {
      return apiError("action должен быть done|snooze", 400)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/reminders/:id] PATCH error:", err)
    return apiError("Internal server error", 500)
  }
}
