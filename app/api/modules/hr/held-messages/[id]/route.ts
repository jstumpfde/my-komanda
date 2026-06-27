// Придержанное сообщение — действие HR: отправить вручную / отклонить.
// PATCH { action: "send" | "dismiss" }
import { NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { heldMessages } from "@/lib/db/schema"
import { requireCompany } from "@/lib/api-helpers"
import { getValidToken } from "@/lib/hh-helpers"
import { sendNegotiationMessage } from "@/lib/hh-api"

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompany()
    const { id } = await ctx.params
    const { action } = (await req.json().catch(() => ({}))) as { action?: string }
    if (action !== "send" && action !== "dismiss") {
      return NextResponse.json({ error: "bad action" }, { status: 400 })
    }

    const [row] = await db.select().from(heldMessages)
      .where(and(eq(heldMessages.id, id), eq(heldMessages.companyId, user.companyId), eq(heldMessages.status, "held")))
      .limit(1)
    if (!row) return NextResponse.json({ error: "not found" }, { status: 404 })

    if (action === "send") {
      // Отправляем очищенный текст вручную (страж прогонит ещё раз — он уже чистый).
      if (!row.hhResponseId) return NextResponse.json({ error: "no_hh_response" }, { status: 400 })
      const token = await getValidToken(user.companyId)
      if (!token) return NextResponse.json({ error: "no_hh_token" }, { status: 400 })
      try {
        await sendNegotiationMessage(token.accessToken, row.hhResponseId, row.messageText, user.companyId)
      } catch (sendErr) {
        return NextResponse.json({ error: "send_failed", detail: String(sendErr).slice(0, 200) }, { status: 502 })
      }
    }

    await db.update(heldMessages)
      .set({ status: action === "send" ? "sent" : "dismissed", resolvedAt: new Date() })
      .where(eq(heldMessages.id, id))
    return NextResponse.json({ ok: true, status: action === "send" ? "sent" : "dismissed" })
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
