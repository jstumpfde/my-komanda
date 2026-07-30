// POST /api/modules/ai-rop/calls/[id]/process — (пере)запустить пайплайн разбора звонка.
// ?script_product=МП|МК|... — принудительный выбор скрипта (обход AI auto-detect).
import { NextRequest, NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropCalls } from "@/lib/db/schema"
import { requireCompany, apiError } from "@/lib/api-helpers"
import { ropCanViewTeam, ropManagerScope } from "@/lib/ai-rop/access"
import { ropCallsScope, type RopScope } from "@/lib/ai-rop/rls"
import { processCall } from "@/lib/ai-rop/pipeline"

export const maxDuration = 300

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompany()
    const { id } = await ctx.params
    if (!id) return apiError("id обязателен", 400)

    const scope: RopScope = {
      companyId: user.companyId,
      isTeamViewer: ropCanViewTeam(user),
      bitrixManagerId: null,
    }
    if (!scope.isTeamViewer) scope.bitrixManagerId = await ropManagerScope(user)

    const [owned] = await db
      .select({ id: ropCalls.id })
      .from(ropCalls)
      .where(and(eq(ropCalls.id, id), ropCallsScope(scope)))
      .limit(1)
    if (!owned) return apiError("Звонок не найден", 404)

    const scriptProductOverride = req.nextUrl.searchParams.get("script_product") || undefined

    try {
      await processCall(id, user.companyId, { scriptProductOverride })
      return NextResponse.json({ ok: true })
    } catch (e) {
      return apiError((e as Error).message, 500)
    }
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/calls/:id/process] error:", err)
    return apiError("Internal server error", 500)
  }
}
