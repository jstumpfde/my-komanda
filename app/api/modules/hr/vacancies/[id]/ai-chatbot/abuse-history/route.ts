// #79 История срабатываний фильтра оскорблений.
// Возвращает последние 20 записей ai_chatbot_messages по вакансии,
// где escalation_reason начинается с "security_abuse".

import { NextRequest, NextResponse } from "next/server"
import { and, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
import { requireCompany } from "@/lib/api-helpers"

interface HistoryRow {
  id:               string
  created_at:       string
  candidate_id:     string
  candidate_name:   string | null
  incoming_message: string
  escalation_reason: string | null
}

const ABUSE_REASONS = [
  "security_abuse",
  "security_abuse_escalate",
  "security_abuse_needs_review",
  "security_abuse_auto_reject",
  "security_abuse_warn_and_continue",
]

function actionFromReason(reason: string | null): "escalate" | "needs_review" | "auto_reject" | "warn_and_continue" {
  if (reason === "security_abuse_auto_reject") return "auto_reject"
  if (reason === "security_abuse_needs_review") return "needs_review"
  if (reason === "security_abuse_warn_and_continue") return "warn_and_continue"
  return "escalate"
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompany()
    const { id } = await ctx.params

    const [v] = await db
      .select({ id: vacancies.id })
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)
    if (!v) return NextResponse.json({ error: "not found" }, { status: 404 })

    const rows = (await db.execute(sql`
      SELECT
        m.id                                 AS id,
        m.created_at                         AS created_at,
        m.candidate_id                       AS candidate_id,
        c.name                               AS candidate_name,
        m.incoming_message                   AS incoming_message,
        m.escalation_reason                  AS escalation_reason
      FROM ai_chatbot_messages m
      LEFT JOIN candidates c ON c.id = m.candidate_id
      WHERE m.vacancy_id = ${id}::uuid
        AND m.escalation_reason = ANY(${ABUSE_REASONS}::text[])
      ORDER BY m.created_at DESC
      LIMIT 20
    `)) as unknown as HistoryRow[]

    const items = (rows ?? []).map(r => {
      const action = actionFromReason(r.escalation_reason)
      const canUndo = action === "auto_reject" || action === "needs_review"
      return {
        id:              r.id,
        createdAt:       r.created_at,
        candidateId:     r.candidate_id,
        candidateName:   r.candidate_name,
        reason:          r.escalation_reason ?? "security_abuse",
        action,
        incomingMessage: r.incoming_message,
        canUndo,
      }
    })

    return NextResponse.json({ items })
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
