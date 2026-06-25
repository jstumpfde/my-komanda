/**
 * POST /api/cron/funnel-v2-tick
 *
 * Периодический тик рантайма воронки v2 (рекомендуемый crontab: раз в 5 минут).
 *
 * Что делает (Фаза 1):
 * - Выбирает кандидатов с funnelV2StateJson IS NOT NULL, completedAt IS NULL
 *   (активные в v2-воронке), LIMIT 50.
 * - Для каждого: проверяет готовность дожима (follow_up_messages с branch funnelv2:*
 *   которые пора отправить) — фактическую отправку делает cron/follow-up,
 *   тик только диагностирует зависшие стадии.
 * - Базовая проверка завершения стадии demo: если дemoProgressJson.completedAt
 *   заполнен И stage.rule.autoAdvance=true → продвигаем на следующую стадию.
 *
 * Что НЕ делает (TODO Фаза 2):
 * - Авто-отказ по score vs threshold (scheduleV2Rejection).
 * - Прохождение prequalification/test (onAnketaCompleted/onTestSubmitted).
 * - Pending-rejections v2-ветка.
 *
 * Защита: X-Cron-Secret header. Запись в cron_runs через startCronRun/finishCronRun.
 * Cooldown: 3 минуты между успешными запусками (не чаще crontab).
 *
 * Расписание на сервере (crontab — раз в 5 минут):
 * ```
 * *\/5 * * * * curl -s -X POST -H "X-Cron-Secret: $CRON_SECRET" \
 *   https://company24.pro/api/cron/funnel-v2-tick \
 *   >> /var/log/funnel-v2-tick.log 2>&1
 * ```
 */

import { NextRequest, NextResponse } from "next/server"
import { eq, isNotNull, and, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies, cronRuns } from "@/lib/db/schema"
import { checkCronAuth } from "@/lib/cron/auth"
import { startCronRun, finishCronRun } from "@/lib/cron/record-run"
import { normalizeFunnelV2 } from "@/lib/funnel-v2/types"
import { advanceToNextStage } from "@/lib/funnel-v2/advance-stage"
import type { CandidateForExecutor, VacancyForExecutor } from "@/lib/funnel-v2/runtime-executor"
import type { FunnelV2State } from "@/lib/db/schema"

const CRON_NAME      = "funnel-v2-tick"
const LIMIT          = 50
const MIN_COOLDOWN_MS = 3 * 60_000   // 3 минуты между успешными запусками

// ── Утилита: последний успешный запуск ────────────────────────────────────────

async function lastSuccessfulRunAt(): Promise<Date | null> {
  const [row] = await db
    .select({ finishedAt: cronRuns.finishedAt })
    .from(cronRuns)
    .where(and(eq(cronRuns.cronName, CRON_NAME), eq(cronRuns.status, "ok")))
    .orderBy(desc(cronRuns.startedAt))
    .limit(1)
  return row?.finishedAt ?? null
}

// ── Основной handler ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = checkCronAuth(req)
  if (!auth.ok) return auth.response

  // Cooldown
  const lastOk = await lastSuccessfulRunAt()
  if (lastOk && Date.now() - lastOk.getTime() < MIN_COOLDOWN_MS) {
    return NextResponse.json({
      ok:      true,
      skipped: true,
      reason:  "too_recent",
      lastOk:  lastOk.toISOString(),
    })
  }

  const run = await startCronRun(CRON_NAME)
  const startedAt = Date.now()

  let checked    = 0
  let advanced   = 0
  let errors     = 0
  const details: Array<{ candidateId: string; action: string; error?: string }> = []

  try {
    // Выбираем активных кандидатов v2: funnelV2StateJson IS NOT NULL, completedAt IS NULL.
    // completedAt внутри jsonb — фильтруем в JS (для простоты Фазы 1; индекс — Фаза 2).
    const rows = await db
      .select({
        id:               candidates.id,
        token:            candidates.token,
        name:             candidates.name,
        email:            candidates.email,
        phone:            candidates.phone,
        vacancyId:        candidates.vacancyId,
        funnelV2StateJson: candidates.funnelV2StateJson,
        demoProgressJson: candidates.demoProgressJson,
      })
      .from(candidates)
      .where(isNotNull(candidates.funnelV2StateJson))
      .orderBy(candidates.createdAt)
      .limit(LIMIT)

    // Фильтруем: только те, у кого completedAt=null в state (воронка ещё активна)
    const active = rows.filter(r => {
      const state = r.funnelV2StateJson as FunnelV2State | null
      return state && !state.completedAt
    })

    if (active.length === 0) {
      await finishCronRun(run.id, "ok", { checked: 0, advanced: 0, errors: 0 })
      return NextResponse.json({
        ok: true, checked: 0, advanced: 0, errors: 0,
        durationMs: Date.now() - startedAt,
      })
    }

    // Загружаем вакансии одним запросом (дедупликация по vacancyId)
    const vacancyIds = [...new Set(active.map(r => r.vacancyId))]
    const { inArray } = await import("drizzle-orm")
    const vacRows = await db
      .select({
        id:                     vacancies.id,
        title:                  vacancies.title,
        companyId:              vacancies.companyId,
        descriptionJson:        vacancies.descriptionJson,
        funnelV2RuntimeEnabled: vacancies.funnelV2RuntimeEnabled,
        scheduleEnabled:        vacancies.scheduleEnabled,
        scheduleStart:          vacancies.scheduleStart,
        scheduleEnd:            vacancies.scheduleEnd,
        scheduleTimezone:       vacancies.scheduleTimezone,
        scheduleWorkingDays:    vacancies.scheduleWorkingDays,
        scheduleExcludedHolidayIds: vacancies.scheduleExcludedHolidayIds,
      })
      .from(vacancies)
      .where(inArray(vacancies.id, vacancyIds))

    const vacMap = new Map(vacRows.map(v => [v.id, v]))

    // Обрабатываем каждого активного кандидата
    for (const row of active) {
      checked++
      const state = row.funnelV2StateJson as FunnelV2State
      const vac = vacMap.get(row.vacancyId)

      // Пропускаем: вакансия не найдена или флаг выключен
      if (!vac || !vac.funnelV2RuntimeEnabled) {
        details.push({ candidateId: row.id, action: "skip_no_vac_or_flag" })
        continue
      }

      try {
        const descJson = vac.descriptionJson as Record<string, unknown> | null
        const funnelV2 = normalizeFunnelV2(descJson?.funnelV2)
        const currentStage = funnelV2.stages.find(s => s.id === state.stageId)

        if (!currentStage) {
          // stageId не найден в конфиге — воронка рассинхронизирована, пропускаем
          details.push({ candidateId: row.id, action: "skip_stage_not_found", error: state.stageId })
          continue
        }

        // ── Проверка автопродвижения для стадии demo ──────────────────────────
        // Фаза 1: только demo + autoAdvance=true + demoProgressJson.completedAt заполнен.
        // Полные правила (score vs threshold, avto-reject) — Фаза 2.
        if (currentStage.action === "demo" && currentStage.rule.autoAdvance) {
          const progress = row.demoProgressJson as { completedAt?: string | null } | null
          if (progress?.completedAt) {
            const candidateForV2: CandidateForExecutor = {
              id:                row.id,
              token:             row.token ?? "",
              name:              row.name,
              email:             row.email,
              phone:             row.phone,
              vacancyId:         row.vacancyId,
              funnelV2StateJson: state,
            }
            const vacancyForV2: VacancyForExecutor = {
              id:                         vac.id,
              title:                      vac.title,
              companyId:                  vac.companyId,
              funnelV2,
              funnelV2RuntimeEnabled:     true,
              scheduleEnabled:            vac.scheduleEnabled,
              scheduleStart:              vac.scheduleStart,
              scheduleEnd:                vac.scheduleEnd,
              scheduleTimezone:           vac.scheduleTimezone,
              scheduleWorkingDays:        vac.scheduleWorkingDays,
              scheduleExcludedHolidayIds: vac.scheduleExcludedHolidayIds,
            }
            await advanceToNextStage(candidateForV2, vacancyForV2)
            advanced++
            details.push({ candidateId: row.id, action: "advanced_demo_completed" })
            continue
          }
        }

        // ── Остальные стадии: диагностика зависания (логируем, не действуем) ─
        // Полная логика завершения (prequalification/test/interview) — Фаза 2.
        details.push({
          candidateId: row.id,
          action:      `watching:${currentStage.action}`,
        })
      } catch (candErr) {
        errors++
        const msg = candErr instanceof Error ? candErr.message : String(candErr)
        details.push({ candidateId: row.id, action: "error", error: msg.slice(0, 200) })
        console.error("[cron/funnel-v2-tick] ошибка обработки кандидата", {
          candidateId: row.id, error: msg,
        })
      }
    }

    const durationMs = Date.now() - startedAt
    const meta = { checked, advanced, errors, durationMs }
    console.log(JSON.stringify({ tag: "cron/funnel-v2-tick", ...meta, ts: new Date().toISOString() }))

    await finishCronRun(run.id, "ok", meta)
    return NextResponse.json({ ok: true, ...meta })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await finishCronRun(run.id, "error", null, msg)
    console.error("[cron/funnel-v2-tick] fatal:", msg)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
