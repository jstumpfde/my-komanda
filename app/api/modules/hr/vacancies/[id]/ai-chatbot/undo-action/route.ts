// #79 Отмена решения фильтра оскорблений.
// На вход — messageId из ai_chatbot_messages. По escalation_reason понимаем,
// какое действие выполнялось, и откатываем его на кандидате.

import { NextRequest, NextResponse } from "next/server"
import { and, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies, candidates } from "@/lib/db/schema"
import { requireCompany } from "@/lib/api-helpers"

interface MessageRow {
  id:                string
  candidate_id:      string
  escalation_reason: string | null
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompany()
    const { id } = await ctx.params
    const body = await req.json().catch(() => ({})) as { messageId?: string }
    const messageId = body.messageId

    if (!messageId || typeof messageId !== "string") {
      return NextResponse.json({ error: "missing_message_id" }, { status: 400 })
    }

    // Проверка прав на вакансию.
    const [v] = await db
      .select({ id: vacancies.id })
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)
    if (!v) return NextResponse.json({ error: "not_found" }, { status: 404 })

    // Достаём запись.
    const rows = (await db.execute(sql`
      SELECT id, candidate_id, escalation_reason
      FROM ai_chatbot_messages
      WHERE id = ${messageId}::uuid AND vacancy_id = ${id}::uuid
      LIMIT 1
    `)) as unknown as MessageRow[]
    const msg = rows?.[0]
    if (!msg) return NextResponse.json({ error: "message_not_found" }, { status: 404 })

    const reason = msg.escalation_reason ?? ""
    if (reason !== "security_abuse_auto_reject" && reason !== "security_abuse_needs_review") {
      return NextResponse.json({ error: "not_undoable" }, { status: 400 })
    }

    // Откатываем состояние кандидата — читаем через JOIN с vacancies, чтобы
    // убедиться, что кандидат принадлежит той же компании (tenant-изоляция).
    const candRows = await db
      .select({
        id:    candidates.id,
        stage: candidates.stage,
      })
      .from(candidates)
      .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
      .where(and(
        eq(candidates.id, msg.candidate_id),
        eq(vacancies.companyId, user.companyId),
      ))
      .limit(1)
    const cand = candRows[0]
    if (!cand) return NextResponse.json({ error: "candidate_not_found" }, { status: 404 })

    if (reason === "security_abuse_auto_reject") {
      // Возвращаем стадию в processing (нейтральное состояние) и снимаем пометки.
      await db.update(candidates).set({
        stage: cand.stage === "rejected" ? "processing" : cand.stage,
        autoProcessingStopped: false,
        autoProcessingStoppedReason: null,
        autoProcessingStoppedAt: null,
        automationPaused: false,
        updatedAt: new Date(),
      }).where(eq(candidates.id, cand.id))
    } else {
      // needs_review — снимаем флаги, стадию не трогаем (мы её и не меняли).
      await db.update(candidates).set({
        autoProcessingStopped: false,
        autoProcessingStoppedReason: null,
        autoProcessingStoppedAt: null,
        automationPaused: false,
        updatedAt: new Date(),
      }).where(eq(candidates.id, cand.id))
    }

    // Помечаем запись как отменённую (через суффикс в reason),
    // чтобы повторно не отменили.
    await db.execute(sql`
      UPDATE ai_chatbot_messages
      SET escalation_reason = ${reason + "_undone"}
      WHERE id = ${messageId}::uuid
    `)

    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
