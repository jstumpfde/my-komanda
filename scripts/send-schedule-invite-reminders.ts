/**
 * scripts/send-schedule-invite-reminders.ts
 *
 * Досылка напоминания кандидатам, которые ранее получили ссылку на
 * самозапись на интервью (follow_up_messages.branch='schedule_invite'), но
 * так и не забронировали слот. В обычном режиме scheduleInterviewInvite
 * дедупит по pending|sent — повторно отправить нельзя, поэтому здесь
 * вызывается с allowResend=true (lib/messaging/schedule-invite.ts).
 *
 * Когорта — кандидаты вакансии, у которых:
 *   - stage='interview', deleted_at IS NULL
 *   - НЕТ подтверждённой брони в calendar_events (type='interview', status='confirmed')
 *   - НЕТ pending schedule_invite строки (напоминание уже в очереди — не дублируем)
 *   - есть хотя бы одна SENT schedule_invite строка с sent_at старше --min-age-hours
 *     (иначе дошлём слишком рано — кандидат мог ещё не увидеть первое сообщение)
 *   - общее число SENT schedule_invite строк < --max-sent (защита от спама;
 *     дефолт 2 = максимум одно напоминание поверх оригинального приглашения)
 *
 * Текст берётся тем же путём, что и оригинальное приглашение — scheduleInterviewInvite
 * сам резолвит текст интервью-стадии воронки / per-вакансия шаблон / дефолт,
 * здесь ничего не хардкодится.
 *
 * Без --execute — только печатает план (id, ФИО, когда было последнее
 * приглашение, сколько раз слали) и итог. С --execute — реально ставит
 * напоминание в очередь через scheduleInterviewInvite({ ..., allowResend: true }).
 *
 * Запуск (на сервере, из /var/www/my-komanda):
 *   pnpm exec tsx --env-file=.env scripts/send-schedule-invite-reminders.ts \
 *     --vacancy=6916db01-a765-4c4e-a652-81475566f95b
 *   pnpm exec tsx --env-file=.env scripts/send-schedule-invite-reminders.ts \
 *     --vacancy=6916db01-a765-4c4e-a652-81475566f95b --min-age-hours=6 --execute
 *
 * --favorites-only — только избранные (is_favorite) кандидаты (тот же
 * принцип, что в scripts/backfill-schedule-invites.ts).
 */

import { and, desc, eq, inArray, isNull } from "drizzle-orm"
import { db, pgClient } from "@/lib/db"
import { candidates, calendarEvents, followUpMessages } from "@/lib/db/schema"
import { scheduleInterviewInvite, SCHEDULE_INVITE_BRANCH } from "@/lib/messaging/schedule-invite"

const DELAY_MS = 200 // пауза между напоминаниями в режиме --execute

function arg(name: string): string | undefined {
  const pfx = `--${name}=`
  const found = process.argv.find((a) => a.startsWith(pfx))
  return found ? found.slice(pfx.length) : undefined
}
const EXECUTE = process.argv.includes("--execute")
const FAVORITES_ONLY = process.argv.includes("--favorites-only")

const MIN_AGE_HOURS = Number(arg("min-age-hours") ?? "4")
const MAX_SENT = Number(arg("max-sent") ?? "2")

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

async function main() {
  const vacancyId = arg("vacancy")
  if (!vacancyId) {
    console.error("Использование: --vacancy=<uuid> [--min-age-hours=4] [--max-sent=2] [--favorites-only] [--execute]")
    process.exit(1)
  }
  if (!Number.isFinite(MIN_AGE_HOURS) || MIN_AGE_HOURS < 0) {
    console.error("--min-age-hours должен быть неотрицательным числом")
    process.exit(1)
  }
  if (!Number.isFinite(MAX_SENT) || MAX_SENT < 1) {
    console.error("--max-sent должен быть числом >= 1")
    process.exit(1)
  }

  console.log(
    `[send-schedule-invite-reminders] вакансия=${vacancyId} min-age-hours=${MIN_AGE_HOURS} max-sent=${MAX_SENT}` +
    `${FAVORITES_ONLY ? " favorites-only" : ""}${EXECUTE ? " — РЕЖИМ EXECUTE" : " — dry-run (только план)"}`,
  )

  // Кандидаты вакансии в стадии interview, не удалённые (корзина не в счёт).
  const interviewCands = await db
    .select({
      id: candidates.id,
      name: candidates.name,
      shortId: candidates.shortId,
      vacancyId: candidates.vacancyId,
    })
    .from(candidates)
    .where(and(
      eq(candidates.vacancyId, vacancyId),
      eq(candidates.stage, "interview"),
      isNull(candidates.deletedAt),
      ...(FAVORITES_ONLY ? [eq(candidates.isFavorite, true)] : []),
    ))

  if (interviewCands.length === 0) {
    console.log("[send-schedule-invite-reminders] нет кандидатов в stage='interview' на этой вакансии.")
    await pgClient.end({ timeout: 5 })
    process.exit(0)
  }

  const ids = interviewCands.map((c) => c.id)

  // У кого уже есть подтверждённая бронь — им напоминание не нужно.
  const bookedRows = await db
    .select({ candidateId: calendarEvents.candidateId })
    .from(calendarEvents)
    .where(and(
      inArray(calendarEvents.candidateId, ids),
      eq(calendarEvents.type, "interview"),
      eq(calendarEvents.status, "confirmed"),
    ))
  const bookedIds = new Set(bookedRows.map((r) => r.candidateId).filter((x): x is string => !!x))

  // Все schedule_invite строки (pending + sent) кандидатов когорты — по ним
  // считаем pending-блокировку, число sent и дату последнего sent.
  const inviteRows = await db
    .select({
      candidateId: followUpMessages.candidateId,
      status: followUpMessages.status,
      sentAt: followUpMessages.sentAt,
      scheduledAt: followUpMessages.scheduledAt,
    })
    .from(followUpMessages)
    .where(and(
      inArray(followUpMessages.candidateId, ids),
      eq(followUpMessages.branch, SCHEDULE_INVITE_BRANCH),
      inArray(followUpMessages.status, ["pending", "sent"]),
    ))
    .orderBy(desc(followUpMessages.sentAt))

  const pendingIds = new Set<string>()
  const sentCountByCandidate = new Map<string, number>()
  const lastSentAtByCandidate = new Map<string, Date>()
  for (const row of inviteRows) {
    if (!row.candidateId) continue
    if (row.status === "pending") {
      pendingIds.add(row.candidateId)
      continue
    }
    // status === 'sent'
    sentCountByCandidate.set(row.candidateId, (sentCountByCandidate.get(row.candidateId) ?? 0) + 1)
    if (row.sentAt && !lastSentAtByCandidate.has(row.candidateId)) {
      // orderBy desc(sentAt) — первая встреченная запись кандидата = самая свежая.
      lastSentAtByCandidate.set(row.candidateId, row.sentAt)
    }
  }

  const now = Date.now()
  const minAgeMs = MIN_AGE_HOURS * 60 * 60_000

  interface Candidate { id: string; name: string; shortId: string | null; vacancyId: string }
  const cohort: Array<{ c: Candidate; sentCount: number; lastSentAt: Date }> = []
  const skippedReasons = { booked: 0, pending: 0, noSent: 0, tooRecent: 0, maxSentReached: 0 }

  for (const c of interviewCands) {
    if (bookedIds.has(c.id)) { skippedReasons.booked++; continue }
    if (pendingIds.has(c.id)) { skippedReasons.pending++; continue }
    const sentCount = sentCountByCandidate.get(c.id) ?? 0
    const lastSentAt = lastSentAtByCandidate.get(c.id)
    if (sentCount === 0 || !lastSentAt) { skippedReasons.noSent++; continue }
    if (now - lastSentAt.getTime() < minAgeMs) { skippedReasons.tooRecent++; continue }
    if (sentCount >= MAX_SENT) { skippedReasons.maxSentReached++; continue }
    cohort.push({ c, sentCount, lastSentAt })
  }

  console.log(`[send-schedule-invite-reminders] всего в interview:              ${interviewCands.length}`)
  console.log(`[send-schedule-invite-reminders] уже забронировали:              ${skippedReasons.booked}`)
  console.log(`[send-schedule-invite-reminders] уже есть pending-приглашение:   ${skippedReasons.pending}`)
  console.log(`[send-schedule-invite-reminders] ни разу не отправлялось:        ${skippedReasons.noSent}`)
  console.log(`[send-schedule-invite-reminders] последнее отправлено недавно:   ${skippedReasons.tooRecent} (< ${MIN_AGE_HOURS}ч)`)
  console.log(`[send-schedule-invite-reminders] лимит напоминаний исчерпан:     ${skippedReasons.maxSentReached} (>= ${MAX_SENT} отправок)`)
  console.log(`[send-schedule-invite-reminders] кандидатов для напоминания:     ${cohort.length}\n`)

  cohort.forEach(({ c, sentCount, lastSentAt }, i) => {
    console.log(
      `  ${i + 1}. ${c.id}  #${c.shortId ?? "—"}  ${c.name ?? "(без имени)"}  ` +
      `последнее приглашение: ${lastSentAt.toISOString()}  отправок: ${sentCount}`,
    )
  })

  if (!EXECUTE) {
    console.log(`\n[send-schedule-invite-reminders] dry-run — напоминания НЕ отправлены. Повторить с --execute для применения.`)
    await pgClient.end({ timeout: 5 })
    process.exit(0)
  }

  let scheduled = 0
  let skipped = 0
  let errors = 0
  for (const { c } of cohort) {
    try {
      const res = await scheduleInterviewInvite({ candidateId: c.id, vacancyId: c.vacancyId, allowResend: true })
      if (res.scheduled) {
        scheduled++
        console.log(`  ✓ ${c.id} — напоминание поставлено в очередь`)
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

  console.log(`\n[send-schedule-invite-reminders] ИТОГО: поставлено=${scheduled} пропущено=${skipped} ошибок=${errors}`)
}

main()
  .then(async () => { await pgClient.end({ timeout: 5 }); process.exit(0) })
  .catch(async (err) => {
    console.error("[send-schedule-invite-reminders] ФАТАЛЬНАЯ ОШИБКА:", err instanceof Error ? err.message : err)
    await pgClient.end({ timeout: 5 }).catch(() => { /* ignore */ })
    process.exit(1)
  })
