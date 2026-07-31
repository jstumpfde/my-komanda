// POST /api/modules/ai-rop/connectors/[id]/validate — «Проверить соединение»
// в UI: расшифровывает сохранённые креды и повторно зовёт connector.validate(),
// обновляет status/lastError. Не принимает новые креды — для смены кредов
// удалить канал и подключить заново (Ф1 не делает update-кредов, чтобы не
// плодить пути расхождения enc/config).
import { NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropChannelConnectors } from "@/lib/db/schema"
import { apiError } from "@/lib/api-helpers"
import { requireRopManage } from "@/lib/ai-rop/access"
import { getConnector } from "@/lib/salesradar/connectors/registry"
import { decryptConnectorCreds } from "@/lib/salesradar/crypto"
import type { ConnectorKind } from "@/lib/salesradar/types"

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRopManage()
    const { id } = await ctx.params

    const [row] = await db
      .select()
      .from(ropChannelConnectors)
      .where(and(eq(ropChannelConnectors.id, id), eq(ropChannelConnectors.companyId, user.companyId)))
      .limit(1)
    if (!row) return apiError("Канал не найден", 404)

    const connector = getConnector(row.kind as ConnectorKind)
    if (!connector) return apiError(`Коннектор kind=${row.kind} не реализован`, 400)

    const creds = row.credentialsEnc ? decryptConnectorCreds(row.credentialsEnc) : {}
    const validation = await connector.validate(row.config ?? {}, creds)

    await db
      .update(ropChannelConnectors)
      .set({ status: validation.ok ? "active" : "error", lastError: validation.ok ? null : validation.error, updatedAt: new Date() })
      .where(eq(ropChannelConnectors.id, id))

    return NextResponse.json({ ok: validation.ok, error: validation.error, accountLabel: validation.accountLabel })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[salesradar/connectors/:id/validate] error:", err)
    return apiError("Internal server error", 500)
  }
}
