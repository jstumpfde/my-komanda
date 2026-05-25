import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates } from "@/lib/db/schema"
import { checkCronAuth } from "@/lib/cron/auth"
import { getPrequalConfig, daysSinceSent, finalizePrequalification } from "@/lib/prequalification/finalize"
import { sendCandidateMessage } from "@/lib/prequalification/start"
import { renderTemplate } from "@/lib/template-renderer"
import { getCandidateFirstName } from "@/lib/messaging/candidate-name"

// POST /api/cron/prequalification
//
// По всем кандидатам с prequalification_status='pending':
//   - daysSinceSent >= fallbackDays → finalize(isTimeout=true). Кандидату
//     отправляется демо без квалификации (verdict='no_answer').
//   - daysSinceSent >= 3 и нет отметки 'prequalification_reminder_3' →
//     отправить reminderD3, оставить отметку в stage_history.
//   - daysSinceSent >= 1 и нет отметки 'prequalification_reminder_1' →
//     отправить reminderD1, оставить отметку.
//
// Отметки в stage_history используются как «уже отправили» — дешевле
// чем отдельные колонки. Дни считаются от prequalification_sent_at.

interface StageHistoryEntry {
  from:   string
  to:     string
  at:     string
  reason: string
}

const DEFAULT_REMINDER_D1 = "{{name}}, напомню — вы откликнулись на «{{vacancy}}». Ответьте, пожалуйста, на пару коротких вопросов, чтобы я мог двигаться дальше с вашей кандидатурой."
const DEFAULT_REMINDER_D3 = "{{name}}, ещё раз напоминаю про вопросы по «{{vacancy}}». Если не получу ответ — отправлю вам общую демонстрацию должности без уточнений."

// firstName уже разрешён хелпером getCandidateFirstName — здесь не сплитим.
function renderReminder(template: string, args: { firstName: string; vacancyTitle: string }): string {
  return renderTemplate(template, {
    name:    args.firstName,
    vacancy: args.vacancyTitle,
  })
}

export async function POST(req: NextRequest) {
  const auth = checkCronAuth(req)
  if (!auth.ok) return auth.response

  const now = new Date()
  const startedAt = Date.now()

  let processed   = 0
  let reminderD1  = 0
  let reminderD3  = 0
  let fallback    = 0
  let failed      = 0
  let skipped     = 0

  try {
    // Берём всех pending. На MVP не делаем пагинацию — кандидатов с
    // прохождением предкв обычно единицы, не тысячи.
    const pending = await db
      .select({
        id:            candidates.id,
        name:          candidates.name,
        sentAt:        candidates.prequalificationSentAt,
        stageHistory:  candidates.stageHistory,
      })
      .from(candidates)
      .where(eq(candidates.prequalificationStatus, "pending"))

    for (const cand of pending) {
      processed++
      try {
        if (!cand.sentAt) { skipped++; continue }
        const days = daysSinceSent(cand.sentAt, now)
        const history = (cand.stageHistory as StageHistoryEntry[] | null) ?? []
        const sentReminders = new Set(history.map(h => h.reason))

        const cfg = await getPrequalConfig(cand.id)
        if (!cfg) { skipped++; continue }

        // 1. Fallback по таймауту.
        if (days >= cfg.fallbackDays) {
          const fin = await finalizePrequalification({ candidateId: cand.id, isTimeout: true })
          if (fin.finalized) fallback++
          else failed++
          continue
        }

        // 2. Д+3 reminder.
        if (days >= 3 && !sentReminders.has("prequalification_reminder_3")) {
          const { firstName } = await getCandidateFirstName(cand.id)
          const text = renderReminder(cfg.reminderD3 || DEFAULT_REMINDER_D3, {
            firstName, vacancyTitle: cfg.vacancyTitle,
          })
          const ok = await sendCandidateMessage(cand.id, text)
          if (ok) {
            reminderD3++
            await db.update(candidates).set({
              stageHistory: [...history, {
                from: "prequalification_pending",
                to:   "prequalification_pending",
                at:   now.toISOString(),
                reason: "prequalification_reminder_3",
              }],
              updatedAt: now,
            }).where(eq(candidates.id, cand.id))
          } else failed++
          continue
        }

        // 3. Д+1 reminder.
        if (days >= 1 && !sentReminders.has("prequalification_reminder_1")) {
          const { firstName } = await getCandidateFirstName(cand.id)
          const text = renderReminder(cfg.reminderD1 || DEFAULT_REMINDER_D1, {
            firstName, vacancyTitle: cfg.vacancyTitle,
          })
          const ok = await sendCandidateMessage(cand.id, text)
          if (ok) {
            reminderD1++
            await db.update(candidates).set({
              stageHistory: [...history, {
                from: "prequalification_pending",
                to:   "prequalification_pending",
                at:   now.toISOString(),
                reason: "prequalification_reminder_1",
              }],
              updatedAt: now,
            }).where(eq(candidates.id, cand.id))
          } else failed++
          continue
        }

        skipped++
      } catch (err) {
        console.error("[cron/prequalification] candidate failed:", cand.id, err instanceof Error ? err.message : err)
        failed++
      }
    }

    const durationMs = Date.now() - startedAt
    const result = { processed, reminderD1, reminderD3, fallback, failed, skipped }
    console.log(JSON.stringify({ tag: "cron/prequalification", ...result, durationMs, ts: now.toISOString() }))
    return NextResponse.json({ ok: true, ...result, durationMs, ts: now.toISOString() })
  } catch (err) {
    console.error("[cron/prequalification]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
