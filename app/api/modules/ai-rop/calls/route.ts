// GET /api/modules/ai-rop/calls — список звонков/взаимодействий компании.
//
// Query: limit (≤200, default 50), offset, status, sentiment, managerId, q
// (полнотекстовый поиск по транскрипту, ILIKE).
//
// Видимость: директор/head/rop_view_team — вся компания; обычный менеджер
// (привязан в rop_managers.userId) — только свои звонки (RLS ropCallsScope).
import { NextRequest, NextResponse } from "next/server"
import { and, desc, eq, ilike, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropAnalyses, ropCalls } from "@/lib/db/schema"
import { requireCompany, apiError } from "@/lib/api-helpers"
import { ropCanViewTeam, ropManagerScope } from "@/lib/ai-rop/access"
import { ropCallsScope, type RopScope } from "@/lib/ai-rop/rls"

export async function GET(req: NextRequest) {
  try {
    const user = await requireCompany()
    const scope: RopScope = {
      companyId: user.companyId,
      isTeamViewer: ropCanViewTeam(user),
      bitrixManagerId: null,
    }
    if (!scope.isTeamViewer) scope.bitrixManagerId = await ropManagerScope(user)

    const { searchParams } = req.nextUrl
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "50", 10) || 50, 1), 200)
    const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10) || 0, 0)
    const status = searchParams.get("status")
    const sentiment = searchParams.get("sentiment")
    const managerId = searchParams.get("managerId")
    const q = searchParams.get("q")?.trim()

    const where = [ropCallsScope(scope)]
    if (status) where.push(eq(ropCalls.status, status))
    if (sentiment) where.push(eq(ropAnalyses.sentiment, sentiment))
    if (managerId) where.push(eq(ropCalls.managerId, managerId))
    if (q) {
      where.push(sql`${ropCalls.id} IN (SELECT call_id FROM rop_transcripts WHERE text ILIKE ${"%" + q + "%"})`)
    }

    const whereClause = and(...where)

    const [items, totalRows] = await Promise.all([
      db
        .select({
          call: ropCalls,
          summary: ropAnalyses.summary,
          sentiment: ropAnalyses.sentiment,
          managerScore: ropAnalyses.managerScore,
          scriptCompliance: ropAnalyses.scriptCompliance,
          nextAction: ropAnalyses.nextAction,
          objectionsJson: ropAnalyses.objectionsJson,
          topicsJson: ropAnalyses.topicsJson,
        })
        .from(ropCalls)
        .leftJoin(ropAnalyses, eq(ropAnalyses.callId, ropCalls.id))
        .where(whereClause)
        .orderBy(desc(ropCalls.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ n: sql<number>`COUNT(*)::int` })
        .from(ropCalls)
        .leftJoin(ropAnalyses, eq(ropAnalyses.callId, ropCalls.id))
        .where(whereClause),
    ])

    return NextResponse.json({ ok: true, items, total: totalRows[0]?.n ?? 0 })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/calls] GET error:", err)
    return apiError("Internal server error", 500)
  }
}
