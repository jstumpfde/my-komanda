/**
 * scripts/reapply-second-demo-gate.ts
 *
 * CLI-обёртка над той же логикой, что и живой роут
 * app/api/modules/hr/vacancies/[id]/reapply-anketa-gate/route.ts — но без
 * requireCompany()/сессии, чтобы прогнать вручную с сервера.
 *
 * Причина существования (10.07): найден баг — гейт «2-й части демо»
 * (maybeScheduleSecondDemoInvite) считается РЕАКТИВНО в answer/route.ts и
 * ждёт AI-оценку максимум 12 сек; если она не успевает, гейт откладывается
 * и НИКТО не перезапускает его позже, даже когда demo_answers_score
 * дописывается асинхронно. Кандидаты застревают на demo_opened с проходным
 * баллом, но без приглашения на 2-ю часть.
 *
 * Использует ТОЧНО те же функции, что и живой роут (maybeScheduleSecondDemoInvite,
 * cancelScheduledRejection) — те же гейты/дедуп/пороги из Портрета. Побочный
 * эффект — ставит follow_up_messages в очередь (кандидату НЕ шлётся ничего
 * немедленно, отправит штатный крон /api/cron/follow-up по расписанию).
 *
 * Запуск (на сервере, из /var/www/my-komanda):
 *   pnpm exec tsx --env-file=.env.local scripts/reapply-second-demo-gate.ts \
 *     --vacancy=6916db01-a765-4c4e-a652-81475566f95b
 *
 * Требует env: DATABASE_URL.
 */

import { and, eq, inArray, isNotNull } from "drizzle-orm"
import { db, pgClient } from "@/lib/db"
import { candidates, vacancies } from "@/lib/db/schema"
import { maybeScheduleSecondDemoInvite } from "@/lib/messaging/second-demo-invite"
import { cancelScheduledRejection } from "@/lib/rejection/execute"

const ELIGIBLE_STAGES = ["new", "primary_contact", "demo_opened", "decision", "anketa_filled"]

function parseArgs(argv: string[]): { vacancyId: string; help: boolean } {
  const args = argv.slice(2)
  let vacancyId = ""
  let help = false
  for (const a of args) {
    if (a === "--help" || a === "-h") { help = true; continue }
    if (a.startsWith("--vacancy=")) { vacancyId = a.slice("--vacancy=".length).trim(); continue }
  }
  return { vacancyId, help }
}

async function main() {
  const opts = parseArgs(process.argv)
  if (opts.help || !opts.vacancyId) {
    console.log("Использование: tsx scripts/reapply-second-demo-gate.ts --vacancy=<uuid>")
    process.exit(opts.help ? 0 : 1)
  }

  const [vac] = await db
    .select({ id: vacancies.id, title: vacancies.title })
    .from(vacancies)
    .where(eq(vacancies.id, opts.vacancyId))
    .limit(1)
  if (!vac) { console.error("Вакансия не найдена:", opts.vacancyId); process.exit(1) }
  console.log(`Вакансия: ${vac.title} (${vac.id})\n`)

  const rows = await db
    .select({ id: candidates.id, pendingRejectionReason: candidates.pendingRejectionReason })
    .from(candidates)
    .where(and(
      eq(candidates.vacancyId, opts.vacancyId),
      inArray(candidates.stage, ELIGIBLE_STAGES),
      isNotNull(candidates.anketaAnswers),
    ))
  console.log(`Кандидатов к проверке: ${rows.length}`)

  const reasons: Record<string, number> = {}
  let invited = 0
  let rejectionsCancelled = 0
  for (const row of rows) {
    try {
      const res = await maybeScheduleSecondDemoInvite({ candidateId: row.id, vacancyId: opts.vacancyId })
      const key = res.scheduled ? "scheduled" : (res.reason ?? "unknown")
      reasons[key] = (reasons[key] ?? 0) + 1
      if (res.scheduled) {
        invited++
        console.log(`  ✓ приглашён на 2-ю часть: ${row.id}`)
        if (row.pendingRejectionReason === "anketa_gate_failed") {
          await cancelScheduledRejection(row.id).catch(() => {})
          rejectionsCancelled++
          console.log(`    отменён отложенный отказ по гейту`)
        }
      }
    } catch (err) {
      reasons.error = (reasons.error ?? 0) + 1
      console.error(`  ОШИБКА ${row.id}:`, err instanceof Error ? err.message : err)
    }
  }

  console.log(`\n=== ИТОГО: проверено=${rows.length} приглашено=${invited} отказов_отменено=${rejectionsCancelled} ===`)
  console.log("По причинам:", reasons)
}

main()
  .then(async () => { await pgClient.end({ timeout: 5 }); process.exit(0) })
  .catch(async (err) => {
    console.error("[reapply-second-demo-gate] ФАТАЛЬНАЯ ОШИБКА:", err instanceof Error ? err.message : err)
    await pgClient.end({ timeout: 5 }).catch(() => { /* ignore */ })
    process.exit(1)
  })
