// Применить / отклонить рекомендацию агента.
// POST body: { action: "apply" | "dismiss" }

import { NextRequest } from "next/server"
import { apiError, apiSuccess, requireDirector } from "@/lib/api-helpers"
import { applyAction, dismissAction } from "@/lib/yandex-direct/agent"

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireDirector()
    const { id } = await ctx.params
    const body = await req.json().catch(() => ({}))
    const action = body.action

    if (action === "apply") {
      await applyAction(user.companyId, id, user.id as string)
      return apiSuccess({ ok: true, status: "applied" })
    }
    if (action === "dismiss") {
      await dismissAction(user.companyId, id)
      return apiSuccess({ ok: true, status: "dismissed" })
    }
    return apiError("action должен быть apply или dismiss", 400)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[yandex-direct/agent/action]", err)
    return apiError(err instanceof Error ? err.message : "Не удалось обработать рекомендацию", 500)
  }
}
