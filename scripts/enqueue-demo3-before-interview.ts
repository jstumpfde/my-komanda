/**
 * scripts/enqueue-demo3-before-interview.ts
 *
 * Ручной запуск механизма «мягкое напоминание про Демо-3 перед интервью»
 * (lib/messaging/demo3-before-interview.ts) для СУЩЕСТВУЮЩИХ кандидатов —
 * тех, кто уже записался/переведён в интервью ДО деплоя механизма и потому не
 * получил напоминания автоматически.
 *
 * КРИТИЧНО (владелец сказал СТОП рассылкам 14.07): по умолчанию — DRY-RUN,
 * ничего не создаётся. Реальную постановку в очередь включает --execute, и
 * запускать её должен КООРДИНАТОР осознанно. Механизм сам по себе идемпотентен
 * (дедуп одно напоминание на кандидата) и гейтит (>1 демо, последний скорируемый,
 * не пройден) — скрипт лишь прогоняет его по когорте.
 *
 * Когорта: кандидаты вакансии в стадиях interview/scheduled (по умолчанию),
 * не удалённые. Гейт/дедуп/настраиваемый текст — внутри
 * maybeScheduleDemo3BeforeInterview (единый источник истины с триггерами).
 *
 * Запуск (на сервере, из /var/www/my-komanda):
 *   pnpm exec tsx --env-file=.env scripts/enqueue-demo3-before-interview.ts \
 *     --vacancy=<uuid> [--stages=interview,scheduled] [--execute]
 * Без --execute — dry-run: печатает, кому БЫЛО БЫ поставлено напоминание.
 */

import { and, eq, inArray, isNull } from "drizzle-orm"
import { db, pgClient } from "@/lib/db"
import { candidates } from "@/lib/db/schema"
import { maybeScheduleDemo3BeforeInterview } from "@/lib/messaging/demo3-before-interview"

function arg(name: string): string | undefined {
  const pfx = `--${name}=`
  const found = process.argv.find((a) => a.startsWith(pfx))
  return found ? found.slice(pfx.length) : undefined
}
const EXECUTE = process.argv.includes("--execute")
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

async function main() {
  const vacancyId = arg("vacancy")
  if (!vacancyId) {
    console.error("Использование: --vacancy=<uuid> [--stages=interview,scheduled] [--execute]")
    process.exit(1)
  }
  const stages = (arg("stages") ?? "interview,scheduled")
    .split(",").map((s) => s.trim()).filter(Boolean)

  console.log(`[enqueue-demo3-before-interview] вакансия=${vacancyId} стадии=${stages.join(",")}${EXECUTE ? " — РЕЖИМ EXECUTE" : " — dry-run"}`)

  const rows = await db
    .select({ id: candidates.id, name: candidates.name, stage: candidates.stage })
    .from(candidates)
    .where(and(
      eq(candidates.vacancyId, vacancyId),
      isNull(candidates.deletedAt),
      inArray(candidates.stage, stages),
    ))

  if (rows.length === 0) {
    console.log("[enqueue-demo3-before-interview] нет кандидатов в этих стадиях — нечего делать")
    return
  }

  let wouldRemind = 0
  let created = 0
  const reasonCounts = new Map<string, number>()

  for (const c of rows) {
    const res = await maybeScheduleDemo3BeforeInterview({
      candidateId: c.id,
      vacancyId,
      dryRun: !EXECUTE,
    })
    if (EXECUTE && res.scheduled) {
      created++
      console.log(`  ✓ ${c.id} (${c.name}) — напоминание поставлено (блок ${res.demo3Id})`)
    } else if (!EXECUTE && res.reason === "dry_run") {
      wouldRemind++
      console.log(`  • ${c.id} (${c.name}, ${c.stage}) — БЫЛО БЫ поставлено (блок ${res.demo3Id})`)
    } else {
      const r = res.reason ?? "unknown"
      reasonCounts.set(r, (reasonCounts.get(r) ?? 0) + 1)
    }
    await sleep(20)
  }

  console.log(`\n[enqueue-demo3-before-interview] кандидатов=${rows.length}` +
    (EXECUTE ? `, создано=${created}` : `, попало бы под напоминание=${wouldRemind}`))
  if (reasonCounts.size > 0) {
    console.log("  пропущено:")
    for (const [reason, n] of reasonCounts) console.log(`    ${reason}: ${n}`)
  }
  console.log("[enqueue-demo3-before-interview] Повтор безопасен: дедуп одно напоминание на кандидата (branch=demo3_before_interview).")
}

main()
  .then(async () => { await pgClient.end({ timeout: 5 }); process.exit(0) })
  .catch(async (err) => {
    console.error("[enqueue-demo3-before-interview] ФАТАЛЬНАЯ ОШИБКА:", err instanceof Error ? err.message : err)
    await pgClient.end({ timeout: 5 }).catch(() => { /* ignore */ })
    process.exit(1)
  })
