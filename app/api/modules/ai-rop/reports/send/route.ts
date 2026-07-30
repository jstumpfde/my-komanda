// POST /api/modules/ai-rop/reports/send — сгенерировать отчёт и отправить в
// Bitrix-мессенджер. Body: { scope: "manager"|"team", managerId?, recipientId?,
// from?, to?, periodLabel? }.
//   recipientId (опц.) — явный получатель (Bitrix user id/"chatN"); если задан,
//     отчёт уходит ТОЛЬКО ему независимо от scope.
//   scope='manager' без recipientId — отчёт про менеджера уходит ему самому.
//   scope='team' без recipientId — всем директорам/head компании, привязанным
//     к rop_managers (userId), либо самому текущему пользователю как fallback.
// Доступ: requireRopTeam.
import { NextResponse } from "next/server"
import { and, eq, inArray, isNotNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropManagers, users } from "@/lib/db/schema"
import { apiError } from "@/lib/api-helpers"
import { requireRopTeam, ropManagerScope } from "@/lib/ai-rop/access"
import { getRopSettings, toBitrixConfig } from "@/lib/ai-rop/settings"
import { createBitrixClient } from "@/lib/ai-rop/bitrix"
import { imSendMessage, type ImSendResult } from "@/lib/ai-rop/bitrix-im"
import { generateReport, type ReportOpts } from "@/lib/ai-rop/reports"

export const maxDuration = 60

const DIRECTOR_LIKE_ROLES = ["director", "client", "platform_admin", "admin", "department_head"]

interface SendResultRow {
  recipient: string
  recipientName?: string
  ok: boolean
  mode?: "live" | "dry"
  messageId?: number
  error?: string
}

export async function POST(req: Request) {
  try {
    const user = await requireRopTeam()
    const body = (await req.json().catch(() => ({}))) as {
      scope?: unknown
      managerId?: unknown
      recipientId?: unknown
      from?: unknown
      to?: unknown
      periodLabel?: unknown
    }

    const scope = body.scope === "team" ? "team" : "manager"
    const managerId = typeof body.managerId === "string" && body.managerId.trim() ? body.managerId.trim() : undefined
    const recipientId = typeof body.recipientId === "string" && body.recipientId.trim() ? body.recipientId.trim() : undefined
    if (scope === "manager" && !managerId) return apiError("Для отчёта по менеджеру нужно выбрать менеджера", 400)

    const opts: ReportOpts = {
      tenantId: user.companyId,
      scope,
      managerId,
      from: typeof body.from === "string" && body.from ? body.from : undefined,
      to: typeof body.to === "string" && body.to ? body.to : undefined,
      periodLabel: typeof body.periodLabel === "string" && body.periodLabel ? body.periodLabel : undefined,
    }

    let recipients: Array<{ bitrixId: string; name?: string }> = []

    if (recipientId) {
      recipients = [{ bitrixId: recipientId }]
    } else if (scope === "manager") {
      recipients = [{ bitrixId: managerId! }]
    } else {
      const rows = await db
        .select({ bitrixManagerId: ropManagers.bitrixManagerId, name: ropManagers.name })
        .from(ropManagers)
        .innerJoin(users, eq(users.id, ropManagers.userId))
        .where(
          and(
            eq(ropManagers.tenantId, user.companyId),
            isNotNull(ropManagers.userId),
            inArray(users.role, DIRECTOR_LIKE_ROLES),
          ),
        )
      recipients = rows.map((r) => ({ bitrixId: r.bitrixManagerId, name: r.name ?? undefined }))

      if (recipients.length === 0) {
        const myBitrixId = await ropManagerScope(user)
        if (myBitrixId) recipients = [{ bitrixId: myBitrixId, name: user.name ?? undefined }]
      }
    }

    if (recipients.length === 0) {
      return apiError(
        scope === "manager"
          ? "У менеджера не указан Bitrix-аккаунт — некому отправить отчёт"
          : "Нет получателей: ни один директор/РОП не привязан к Bitrix-аккаунту (rop_managers)",
        400,
      )
    }

    const settingsRow = await getRopSettings(user.companyId)
    const bitrixConfig = toBitrixConfig(settingsRow)
    if (!bitrixConfig) return apiError("Bitrix не подключён", 400)
    const client = createBitrixClient(bitrixConfig)

    const report = await generateReport(opts)

    const results: SendResultRow[] = []
    for (const r of recipients) {
      let res: ImSendResult
      try {
        res = await imSendMessage(client, r.bitrixId, report.text, bitrixConfig.dryRunMessages)
      } catch (e) {
        res = { ok: false, mode: "live", error: e instanceof Error ? e.message : String(e) }
      }
      results.push({
        recipient: r.bitrixId,
        recipientName: r.name,
        ok: res.ok,
        mode: res.mode,
        messageId: res.messageId,
        error: res.error,
      })
    }

    const sent = results.filter((r) => r.ok).length
    const dry = results.some((r) => r.mode === "dry")

    return NextResponse.json({ ok: sent > 0, sent, total: results.length, dry, title: report.title, results })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/reports/send] error:", err)
    return apiError("Internal server error", 500)
  }
}
