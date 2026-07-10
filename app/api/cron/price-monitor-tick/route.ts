// GET/POST /api/cron/price-monitor-tick
//
// Раз в тик (crontab каждые 15 мин) находит объекты мониторинга цен, которым
// пора обновиться (findDueObjects), и прогоняет их последовательно
// (runObjectMonitor). Ошибка одного объекта не валит остальные.
//
// Защищён X-Cron-Secret + pg_try_advisory_lock, чтобы параллельные тики не
// пересекались. Аудит 10.07: ключ был 7470002 — ТОТ ЖЕ, что у
// pending-rejections (скопирован «по аналогии» без смены значения); сетки
// кронов совпадали каждые 15 мин и глушили друг друга (57%/81% успешных
// прогонов вместо ~100%). Реестр занятых ключей: 7470001 hh-import,
// 7470002 pending-rejections, 7470003 price-monitor-tick.
import { NextRequest, NextResponse } from "next/server"
import { pgClient } from "@/lib/db"
import { checkCronAuth } from "@/lib/cron/auth"
import { startCronRun, finishCronRun } from "@/lib/cron/record-run"
import { findDueObjects, runObjectMonitor } from "@/lib/price-monitor/run-monitor"

export const maxDuration = 300

const LOCK_KEY = 7470003
const DUE_LIMIT = 5

async function handle(req: NextRequest) {
  const auth = checkCronAuth(req)
  if (!auth.ok) return auth.response

  // Advisory lock — session-scoped, поэтому берём и отпускаем его на ОДНОМ
  // выделенном соединении (reserve), а не через пул: иначе unlock может уйти
  // в другую сессию и лок утечёт до конца жизни соединения.
  const reserved = await pgClient.reserve()
  let acquired = false
  try {
    const lockRows = await reserved`SELECT pg_try_advisory_lock(${LOCK_KEY}) AS acquired`
    acquired = lockRows?.[0]?.acquired === true
  } catch {
    reserved.release()
    return NextResponse.json({ ok: false, error: "Не удалось получить advisory lock" }, { status: 500 })
  }
  if (!acquired) {
    reserved.release()
    return NextResponse.json({ ok: false, busy: true }, { status: 409 })
  }

  let objectsCount = 0
  let ownSnapshots = 0
  let competitorSnapshots = 0
  const errors: string[] = []

  try {
    const run = await startCronRun("price-monitor-tick").catch(() => null)

    try {
      const due = await findDueObjects(DUE_LIMIT)
      objectsCount = due.length

      for (const object of due) {
        try {
          const result = await runObjectMonitor(object)
          ownSnapshots += result.ownSnapshots
          competitorSnapshots += result.competitorSnapshots
          if (result.errors.length > 0) {
            errors.push(...result.errors.map((e) => `объект ${object.id}: ${e}`))
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.error(`[price-monitor-tick] объект ${object.id} упал:`, msg)
          errors.push(`объект ${object.id}: ${msg}`)
        }
      }

      if (run) {
        await finishCronRun(run.id, "ok", {
          objects: objectsCount,
          ownSnapshots,
          competitorSnapshots,
          errors,
        })
      }

      return NextResponse.json({
        ok: true,
        objects: objectsCount,
        ownSnapshots,
        competitorSnapshots,
        errors,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error("[price-monitor-tick] top-level:", msg)
      if (run) {
        await finishCronRun(run.id, "error", { objects: objectsCount, ownSnapshots, competitorSnapshots, errors }, msg)
      }
      return NextResponse.json({ ok: false, error: msg }, { status: 500 })
    }
  } finally {
    try {
      await reserved`SELECT pg_advisory_unlock(${LOCK_KEY})`
    } catch {
      // ignore — release() всё равно вернёт соединение, лок умрёт вместе с ним
    } finally {
      reserved.release()
    }
  }
}

export async function GET(req: NextRequest) {
  return handle(req)
}

export async function POST(req: NextRequest) {
  return handle(req)
}
