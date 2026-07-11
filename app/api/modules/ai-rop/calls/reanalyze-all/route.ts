// POST /api/modules/ai-rop/calls/reanalyze-all — массовый сброс звонков в
// 'pending' для повторной обработки. Body: { mode: "done" | "failed" | "all" }.
//   done   — успешно обработанные, у которых есть транскрипт (Whisper/STT не перезапустится)
//   failed — упавшие (в т.ч. без транскрипта — пойдут заново через STT)
//   all    — done+failed с транскриптом
// Доступ: requireRopManage (директор) — массовая операция затратна по AI.
import { NextResponse } from "next/server"
import { and, eq, inArray, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropCalls } from "@/lib/db/schema"
import { apiError } from "@/lib/api-helpers"
import { requireRopManage } from "@/lib/ai-rop/access"

type Mode = "done" | "failed" | "all"

export async function POST(req: Request) {
  try {
    const user = await requireRopManage()
    const body = (await req.json().catch(() => ({}))) as { mode?: Mode }
    const mode: Mode = body.mode === "failed" || body.mode === "all" ? body.mode : "done"

    const hasTranscript = sql`${ropCalls.id} IN (SELECT call_id FROM rop_transcripts WHERE text IS NOT NULL AND text != '')`

    let where
    if (mode === "failed") {
      where = and(eq(ropCalls.tenantId, user.companyId), eq(ropCalls.status, "failed"))
    } else if (mode === "done") {
      where = and(eq(ropCalls.tenantId, user.companyId), eq(ropCalls.status, "done"), hasTranscript)
    } else {
      where = and(eq(ropCalls.tenantId, user.companyId), inArray(ropCalls.status, ["done", "failed"]), hasTranscript)
    }

    const reset = await db
      .update(ropCalls)
      .set({ status: "pending", attempts: 0, error: null })
      .where(where)
      .returning({ id: ropCalls.id })

    const [pendingNow] = await db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(ropCalls)
      .where(and(eq(ropCalls.tenantId, user.companyId), eq(ropCalls.status, "pending")))

    return NextResponse.json({ ok: true, mode, reset: reset.length, pendingNow: pendingNow?.n ?? 0 })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/calls/reanalyze-all] error:", err)
    return apiError("Internal server error", 500)
  }
}
