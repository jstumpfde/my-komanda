// GET /api/modules/ai-rop/calls/[id] — карточка звонка: сам звонок + транскрипт + анализ.
// RLS: чужой звонок (вне scope менеджера) — 404, не 403 (не палим существование).
import { NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropAnalyses, ropCalls, ropTranscripts } from "@/lib/db/schema"
import { requireCompany, apiError } from "@/lib/api-helpers"
import { ropCanViewTeam, ropManagerScope } from "@/lib/ai-rop/access"
import { ropCallsScope, type RopScope } from "@/lib/ai-rop/rls"

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
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

    const [call] = await db
      .select()
      .from(ropCalls)
      .where(and(eq(ropCalls.id, id), ropCallsScope(scope)))
      .limit(1)
    if (!call) return apiError("Звонок не найден", 404)

    const [[transcript], [analysis]] = await Promise.all([
      db.select().from(ropTranscripts).where(eq(ropTranscripts.callId, id)).limit(1),
      db.select().from(ropAnalyses).where(eq(ropAnalyses.callId, id)).limit(1),
    ])

    return NextResponse.json({ ok: true, call, transcript: transcript ?? null, analysis: analysis ?? null })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/calls/:id] GET error:", err)
    return apiError("Internal server error", 500)
  }
}
