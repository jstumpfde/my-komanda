/**
 * scripts/smoke-report-metrics.ts — смок honest-метрик отчёта (аудит 10.07).
 * Гоняет buildReport по одной компании за all / this_week / today и печатает
 * итоги + прямые SQL-контрольные суммы по датам событий для сверки.
 * Read-only. Запуск: pnpm exec tsx --env-file=.env.local scripts/smoke-report-metrics.ts <companyId>
 */
import { sql } from "drizzle-orm"
import { db, pgClient } from "@/lib/db"
import { buildReport } from "@/lib/hr/build-report"

async function main() {
  const companyId = process.argv[2]
  if (!companyId) { console.error("usage: smoke-report-metrics.ts <companyId>"); process.exit(1) }

  for (const period of ["all", "this_week", "today"] as const) {
    const r = await buildReport(companyId, { period })
    const t = r.vacancyTable ?? []
    const sum = (k: "hired" | "rejected" | "selfRejected" | "demo" | "test" | "total") =>
      t.reduce((s: number, row: Record<string, number>) => s + Number(row[k] ?? 0), 0)
    console.log(`\n=== period=${period} ===`)
    console.log(`total=${sum("total")} hired=${sum("hired")} rejected=${sum("rejected")} selfRej=${sum("selfRejected")} demo=${sum("demo")} test=${sum("test")}`)
  }

  // Контрольные суммы напрямую из БД (недели): события за 7 дней.
  const control = await db.execute(sql`
    select
      count(*) filter (where c.hired_at    >= now() - interval '7 days') as hired_7d,
      count(*) filter (where c.rejection_at >= now() - interval '7 days' and c.stage='rejected') as rejected_7d,
      count(*) filter (where c.created_at  >= now() - interval '7 days') as new_7d
    from candidates c join vacancies v on v.id = c.vacancy_id
    where v.company_id = ${companyId} and v.deleted_at is null and c.deleted_at is null
  `)
  console.log("\nКонтроль (события за 7 дней):", control[0] ?? control)
}

main()
  .then(async () => { await pgClient.end({ timeout: 5 }); process.exit(0) })
  .catch(async (e) => { console.error(e); await pgClient.end({ timeout: 5 }).catch(() => {}); process.exit(1) })
