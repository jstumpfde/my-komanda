// POST /api/modules/ai-rop/calls/reanalyze-all — массовый сброс звонков в
// 'pending' для повторной обработки. Body: { mode: "done" | "failed" | "all", dryRun?: boolean }.
//   done   — успешно обработанные, у которых есть транскрипт (Whisper/STT не перезапустится)
//   failed — упавшие (в т.ч. без транскрипта — пойдут заново через STT)
//   all    — done+failed с транскриптом
//   dryRun=true — НЕ сбрасывает ничего, только возвращает count/оценку стоимости.
//     Гард от случайного массового сжигания бюджета: reanalyze-all повторяет
//     ПОЛНЫЙ analyzeCall (Claude) на КАЖДЫЙ звонок (STT пропускается, транскрипт
//     кэширован) — при большом count это реальные деньги за один клик. UI обязан
//     сначала запросить dryRun и показать пользователю оценку до реального сброса.
// Доступ: requireRopManage (директор) — массовая операция затратна по AI.
import { NextResponse } from "next/server"
import { and, eq, inArray, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropCalls } from "@/lib/db/schema"
import { apiError } from "@/lib/api-helpers"
import { requireRopManage } from "@/lib/ai-rop/access"

type Mode = "done" | "failed" | "all"

// Средняя стоимость одного analyzeCall (Sonnet 5 с prompt caching, актуально на
// 30.07.2026, см. handoff rop-token-savings-plan.md) — используется только для
// оценки в UI, не для биллинга.
const EST_USD_PER_CALL = 0.01

function whereForMode(mode: Mode, companyId: string) {
  const hasTranscript = sql`${ropCalls.id} IN (SELECT call_id FROM rop_transcripts WHERE text IS NOT NULL AND text != '')`
  if (mode === "failed") {
    // Все failed — даже без транскрипта (тогда воркер пройдёт через STT заново)
    return and(eq(ropCalls.tenantId, companyId), eq(ropCalls.status, "failed"))
  }
  if (mode === "done") {
    return and(eq(ropCalls.tenantId, companyId), eq(ropCalls.status, "done"), hasTranscript)
  }
  // all = done+failed только с транскриптом (старое поведение «done+failed»)
  return and(eq(ropCalls.tenantId, companyId), inArray(ropCalls.status, ["done", "failed"]), hasTranscript)
}

export async function POST(req: Request) {
  try {
    const user = await requireRopManage()
    const body = (await req.json().catch(() => ({}))) as { mode?: Mode; dryRun?: boolean }
    const mode: Mode = body.mode === "failed" || body.mode === "all" ? body.mode : "done"
    const dryRun = body.dryRun === true

    const where = whereForMode(mode, user.companyId)

    if (dryRun) {
      const [c] = await db
        .select({ n: sql<number>`COUNT(*)::int` })
        .from(ropCalls)
        .where(where)
      const count = c?.n ?? 0
      return NextResponse.json({
        ok: true,
        mode,
        dryRun: true,
        count,
        estUsd: Math.round(count * EST_USD_PER_CALL * 100) / 100,
      })
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
