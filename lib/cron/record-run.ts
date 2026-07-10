// P0-30: helper для записи запуска cron'а в cron_runs.
// Использование:
//   const run = await startCronRun("hh-import")
//   try {
//     ...работа cron'а...
//     await finishCronRun(run.id, "ok", { processed: 42 })
//   } catch (err) {
//     await finishCronRun(run.id, "error", null, String(err))
//     throw err
//   }
import { db } from "@/lib/db"
import { cronRuns } from "@/lib/db/schema"
import { and, eq, lt } from "drizzle-orm"

export async function startCronRun(cronName: string): Promise<{ id: string; startedAt: Date }> {
  const startedAt = new Date()

  // Аудит 10.07: самоочистка зависших строк. Если процесс умер (деплой/OOM)
  // до finishCronRun, строка оставалась 'running' навсегда (на проде успело
  // накопиться 24, старейшая 38 дней) — и мониторинг поверх cron_runs врал.
  // Закрываем осиротевшие прогоны ЭТОГО крона старше 6 часов при каждом новом
  // старте — дёшево и без отдельного уборщика.
  try {
    await db
      .update(cronRuns)
      .set({
        status: "failed",
        finishedAt: startedAt,
        errorMessage: "stale: process died before finishCronRun (auto-closed by next run)",
      })
      .where(and(
        eq(cronRuns.cronName, cronName),
        eq(cronRuns.status, "running"),
        lt(cronRuns.startedAt, new Date(startedAt.getTime() - 6 * 3600_000)),
      ))
  } catch { /* самоочистка не должна мешать запуску */ }

  const [row] = await db
    .insert(cronRuns)
    .values({ cronName, startedAt, status: "running" })
    .returning({ id: cronRuns.id, startedAt: cronRuns.startedAt })
  return { id: row.id, startedAt: row.startedAt ?? startedAt }
}

export async function finishCronRun(
  id: string,
  status: "ok" | "error" | "busy",
  metadata: Record<string, unknown> | null = null,
  errorMessage?: string,
): Promise<void> {
  const finishedAt = new Date()
  const [existing] = await db
    .select({ startedAt: cronRuns.startedAt })
    .from(cronRuns)
    .where(eq(cronRuns.id, id))
    .limit(1)
  const startedAt = existing?.startedAt ?? finishedAt
  const durationMs = finishedAt.getTime() - startedAt.getTime()
  await db
    .update(cronRuns)
    .set({
      finishedAt,
      status,
      durationMs,
      errorMessage: errorMessage ?? null,
      metadata,
    })
    .where(eq(cronRuns.id, id))
}
