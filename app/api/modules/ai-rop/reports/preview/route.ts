// POST /api/modules/ai-rop/reports/preview — сгенерировать текст отчёта (BBCode)
// по менеджеру или команде за период, БЕЗ отправки (кнопка «Сформировать превью»).
// Body: { scope: "manager"|"team", managerId?, from?, to?, periodLabel? }
// Доступ: requireRopTeam.
import { NextResponse } from "next/server"
import { apiError } from "@/lib/api-helpers"
import { requireRopTeam } from "@/lib/ai-rop/access"
import { generateReport, type ReportOpts } from "@/lib/ai-rop/reports"

export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const user = await requireRopTeam()
    const body = (await req.json().catch(() => ({}))) as {
      scope?: unknown
      managerId?: unknown
      from?: unknown
      to?: unknown
      periodLabel?: unknown
    }

    const scope = body.scope === "team" ? "team" : "manager"
    const managerId = typeof body.managerId === "string" && body.managerId.trim() ? body.managerId.trim() : undefined
    if (scope === "manager" && !managerId) return apiError("Для отчёта по менеджеру нужно выбрать менеджера", 400)

    const opts: ReportOpts = {
      tenantId: user.companyId,
      scope,
      managerId,
      from: typeof body.from === "string" && body.from ? body.from : undefined,
      to: typeof body.to === "string" && body.to ? body.to : undefined,
      periodLabel: typeof body.periodLabel === "string" && body.periodLabel ? body.periodLabel : undefined,
    }

    const report = await generateReport(opts)
    return NextResponse.json({ ok: true, title: report.title, text: report.text })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/reports/preview] error:", err)
    return apiError("Internal server error", 500)
  }
}
