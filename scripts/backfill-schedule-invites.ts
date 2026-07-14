/**
 * scripts/backfill-schedule-invites.ts
 *
 * Разовый бэкфилл приглашений записаться на интервью (ссылка /schedule/[token])
 * для кандидатов вакансии, уже переведённых в stage='interview', но не
 * получивших приглашение. Причина находки (14.07): одиночный путь PATCH
 * app/api/modules/hr/candidates/[id]/stage/route.ts:198-203 вызывает
 * scheduleInterviewInvite при переходе в interview, а bulk-actions
 * "invite"/"set_stage" (app/api/modules/hr/candidates/bulk/route.ts) до
 * фикса двигали candidates.stage напрямую, минуя scheduleInterviewInvite —
 * такие кандидаты застревали в interview без ссылки на выбор времени.
 *
 * Находит кандидатов вакансии в stage='interview', у которых:
 *   - НЕТ подтверждённой брони в calendar_events (type='interview', status='confirmed')
 *   - НЕТ follow_up_messages branch='schedule_invite' со статусом pending|sent
 *
 * Без --execute — только печатает план (id, ФИО, дата перехода в interview
 * из stageHistory, если есть) и итоговое число. С --execute — реально ставит
 * приглашение в очередь через scheduleInterviewInvite (lib/messaging/
 * schedule-invite.ts) — он идемпотентен (дедуп pending|sent), поэтому
 * повторный запуск скрипта безопасен. НИКАКИХ прямых INSERT в
 * follow_up_messages — только через эту функцию (правильный текст +
 * дедуп + campaign upsert).
 *
 * Запуск (на сервере, из /var/www/my-komanda):
 *   pnpm exec tsx --env-file=.env scripts/backfill-schedule-invites.ts \
 *     --vacancy=6916db01-a765-4c4e-a652-81475566f95b
 *   pnpm exec tsx --env-file=.env scripts/backfill-schedule-invites.ts \
 *     --vacancy=6916db01-a765-4c4e-a652-81475566f95b --execute
 */

import { and, eq, inArray, isNull } from "drizzle-orm"
import { db, pgClient } from "@/lib/db"
import { candidates, calendarEvents, followUpMessages } from "@/lib/db/schema"
import { scheduleInterviewInvite } from "@/lib/messaging/schedule-invite"

const DELAY_MS = 200 // пауза между приглашениями в режиме --execute

function arg(name: string): string | undefined {
  const pfx = `--${name}=`
  const found = process.argv.find((a) => a.startsWith(pfx))
  return found ? found.slice(pfx.length) : undefined
}
const EXECUTE = process.argv.includes("--execute")

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

interface StageHistoryEntry {
  from?: string | null
  to?: string
  at?: string
}

// Последний переход в 'interview' из stageHistory — для справки в отчёте
// (не участвует в логике отбора).
function findInterviewTransitionAt(stageHistory: unknown): string | null {
  const history = (Array.isArray(stageHistory) ? stageHistory : []) as StageHistoryEntry[]
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]?.to === "interview" && typeof history[i]?.at === "string") return history[i].at as string
  }
  return null
}

async function main() {
  const vacancyId = arg("vacancy")
  if (!vacancyId) {
    console.error("Использование: --vacancy=<uuid> [--execute]")
    process.exit(1)
  }

  console.log(
    `[backfill-schedule-invites] вакансия=${vacancyId}${EXECUTE ? " — РЕЖИМ EXECUTE" : " — dry-run (только план)"}`,
  )

  // Кандидаты вакансии в стадии interview, не удалённые (корзина не в счёт).
  const interviewCands = await db
    .select({
      id: candidates.id,
      name: candidates.name,
      shortId: candidates.shortId,
      stageHistory: candidates.stageHistory,
      vacancyId: candidates.vacancyId,
    })
    .from(candidates)
    .where(and(
      eq(candidates.vacancyId, vacancyId),
      eq(candidates.stage, "interview"),
      isNull(candidates.deletedAt),
    ))

  if (interviewCands.length === 0) {
    console.log("[backfill-schedule-invites] нет кандидатов в stage='interview' на этой вакансии.")
    await pgClient.end({ timeout: 5 })
    process.exit(0)
  }

  const ids = interviewCands.map((c) => c.id)

  // У кого уже есть подтверждённая бронь (см. app/api/public/schedule/[token]/route.ts —
  // именно так там создаётся событие: type='interview', status='confirmed').
  const bookedRows = await db
    .select({ candidateId: calendarEvents.candidateId })
    .from(calendarEvents)
    .where(and(
      inArray(calendarEvents.candidateId, ids),
      eq(calendarEvents.type, "interview"),
      eq(calendarEvents.status, "confirmed"),
    ))
  const bookedIds = new Set(bookedRows.map((r) => r.candidateId).filter((x): x is string => !!x))

  // У кого уже есть pending|sent schedule_invite (см. lib/messaging/schedule-invite.ts).
  const invitedRows = await db
    .select({ candidateId: followUpMessages.candidateId })
    .from(followUpMessages)
    .where(and(
      inArray(followUpMessages.candidateId, ids),
      eq(followUpMessages.branch, "schedule_invite"),
      inArray(followUpMessages.status, ["pending", "sent"]),
    ))
  const invitedIds = new Set(invitedRows.map((r) => r.candidateId))

  const missing = interviewCands.filter((c) => !bookedIds.has(c.id) && !invitedIds.has(c.id))

  console.log(`[backfill-schedule-invites] всего в interview:        ${interviewCands.length}`)
  console.log(`[backfill-schedule-invites] уже забронировали:        ${bookedIds.size}`)
  console.log(`[backfill-schedule-invites] уже есть приглашение:     ${invitedIds.size}`)
  console.log(`[backfill-schedule-invites] без брони и приглашения:  ${missing.length}\n`)

  missing.forEach((c, i) => {
    const transitionAt = findInterviewTransitionAt(c.stageHistory) ?? "—"
    console.log(`  ${i + 1}. ${c.id}  #${c.shortId ?? "—"}  ${c.name ?? "(без имени)"}  переход в interview: ${transitionAt}`)
  })

  if (!EXECUTE) {
    console.log(`\n[backfill-schedule-invites] dry-run — приглашения НЕ отправлены. Повторить с --execute для применения.`)
    await pgClient.end({ timeout: 5 })
    process.exit(0)
  }

  let scheduled = 0
  let skipped = 0
  let errors = 0
  for (const c of missing) {
    try {
      const res = await scheduleInterviewInvite({ candidateId: c.id, vacancyId: c.vacancyId })
      if (res.scheduled) {
        scheduled++
        console.log(`  ✓ ${c.id} — приглашение поставлено в очередь`)
      } else {
        skipped++
        console.log(`  - ${c.id} — пропущен (${res.reason})`)
      }
    } catch (err) {
      errors++
      console.warn(`  ✗ ${c.id} — ошибка:`, err instanceof Error ? err.message : err)
    }
    await sleep(DELAY_MS)
  }

  console.log(`\n[backfill-schedule-invites] ИТОГО: поставлено=${scheduled} пропущено=${skipped} ошибок=${errors}`)
}

main()
  .then(async () => { await pgClient.end({ timeout: 5 }); process.exit(0) })
  .catch(async (err) => {
    console.error("[backfill-schedule-invites] ФАТАЛЬНАЯ ОШИБКА:", err instanceof Error ? err.message : err)
    await pgClient.end({ timeout: 5 }).catch(() => { /* ignore */ })
    process.exit(1)
  })
