// GET/POST /api/cron/b9-status-sanity
//
// B9 (docs/B9-STATUS-UNIFICATION-PLAN.md) — «Безопасный ПЕРВЫЙ шаг»: sanity-check
// cron, ТОЛЬКО SELECT. Ищет расхождения между `candidates.stage` (бизнес-воронка,
// что видит HR) и параллельными флагами обработки (funnelV2StateJson.stageId,
// pendingRejectionAt, prequalificationStatus, automationPaused). НИЧЕГО не
// апдейтит — только считает и логирует сводку в cron_runs.metadata, чтобы
// увидеть реальный размер проблемы на проде перед тем, как что-то чинить.
//
// Защита: X-Cron-Secret. Cooldown 15 минут между успешными запусками (дешёвые
// SELECT'ы, но не нужно гонять чаще — это диагностика, не рантайм-логика).
//
// Crontab (не подключён автоматически — включать вручную, раз в час):
//   0 * * * * curl -s -X POST -H "X-Cron-Secret: $CRON_SECRET" \
//     https://company24.pro/api/cron/b9-status-sanity \
//     >> /var/log/b9-status-sanity.log 2>&1

import { NextRequest, NextResponse } from "next/server"
import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies, cronRuns } from "@/lib/db/schema"
import type { FunnelV2State } from "@/lib/db/schema"
import { checkCronAuth } from "@/lib/cron/auth"
import { startCronRun, finishCronRun } from "@/lib/cron/record-run"
import type { StageActionType } from "@/lib/funnel-v2/types"

const CRON_NAME = "b9-status-sanity"
const MIN_COOLDOWN_MS = 15 * 60_000 // 15 минут между успешными запусками
const MAX_EXAMPLES = 20             // сколько примеров каждого типа держим в отчёте

// Дублирует lib/funnel-v2/advance-stage.ts::mapActionToLegacyStage (не экспортирована
// оттуда — этот cron только читает, отдельная копия таблицы безопаснее, чем
// расширять экспорт чужого модуля ради read-only диагностики).
const ACTION_TO_LEGACY_STAGE: Partial<Record<StageActionType, string>> = {
  prequalification: "primary_contact",
  demo:             "demo_opened",
  test:             "test_task_sent",
  task:             "test_task_sent",
  interview:        "interview",
  offer:            "decision",
  hired:            "hired",
  security_check:   "interview",
  reference_check:  "interview",
  message:          "primary_contact",
}

async function lastSuccessfulRunAt(): Promise<Date | null> {
  const [row] = await db
    .select({ finishedAt: cronRuns.finishedAt })
    .from(cronRuns)
    .where(and(eq(cronRuns.cronName, CRON_NAME), eq(cronRuns.status, "ok")))
    .orderBy(desc(cronRuns.startedAt))
    .limit(1)
  return row?.finishedAt ?? null
}

interface Finding {
  candidateId: string
  vacancyId: string
  detail: string
}

async function run_() {
  const findings = {
    // stage=primary_contact + pendingRejectionAt IS NOT NULL: HR видит «ждёт
    // контакта», но отказ уже тикает — противоречие из плана (п.13).
    primaryContactWithPendingRejection: [] as Finding[],
    // prequalificationStatus='pending' но stage уже уехала дальше 'new'/'primary_contact'
    // (см. план п.15: «стадия не отражает, что идёт опрос»).
    prequalPendingStageMismatch: [] as Finding[],
    // stage='rejected'/'hired' НО automationPaused/autoProcessingStopped НЕ
    // проставлены — рассинхрон флагов остановки (кто-то поставил stage напрямую,
    // минуя executeRejection/каноничный путь).
    terminalStageWithoutStopFlags: [] as Finding[],
    // funnelV2StateJson.stageId существует, стадия по конфигу воронки мапится
    // в legacy-stage, но candidates.stage ≠ этому значению (рассинхрон v2↔legacy,
    // прямой запрос плана: «противоречие между stage и funnelV2StateJson.stageId»).
    v2StageIdLegacyMismatch: [] as Finding[],
    // pendingRejectionAt наступил (просрочен), но кандидат уже давно не rejected —
    // подозрение, что cron pending-rejections застревает/не добирает кандидата
    // (например, off-hours или ошибка). Не апдейтим — просто считаем и приводим
    // топ примеров по возрасту просрочки.
    overdueRejectionStuck: [] as Finding[],
  }

  // ── 1) primary_contact + pendingRejectionAt ────────────────────────────────
  {
    const rows = await db
      .select({ id: candidates.id, vacancyId: candidates.vacancyId, pendingRejectionAt: candidates.pendingRejectionAt })
      .from(candidates)
      .where(and(
        eq(candidates.stage, "primary_contact"),
        isNotNull(candidates.pendingRejectionAt),
        isNull(candidates.deletedAt),
      ))
      .limit(500)
    findings.primaryContactWithPendingRejection = rows.slice(0, MAX_EXAMPLES).map(r => ({
      candidateId: r.id,
      vacancyId:   r.vacancyId,
      detail:      `pendingRejectionAt=${r.pendingRejectionAt?.toISOString() ?? "?"}`,
    }))
    ;(findings as unknown as Record<string, unknown>).primaryContactWithPendingRejectionCount = rows.length
  }

  // ── 2) prequalificationStatus=pending, но stage уехала дальше ──────────────
  {
    const rows = await db
      .select({ id: candidates.id, vacancyId: candidates.vacancyId, stage: candidates.stage })
      .from(candidates)
      .where(and(
        eq(candidates.prequalificationStatus, "pending"),
        isNull(candidates.deletedAt),
        sql`${candidates.stage} NOT IN ('new', 'primary_contact')`,
      ))
      .limit(500)
    findings.prequalPendingStageMismatch = rows.slice(0, MAX_EXAMPLES).map(r => ({
      candidateId: r.id,
      vacancyId:   r.vacancyId,
      detail:      `stage=${r.stage}`,
    }))
    ;(findings as unknown as Record<string, unknown>).prequalPendingStageMismatchCount = rows.length
  }

  // ── 3) терминальная стадия без флагов остановки автоматики ────────────────
  {
    const rows = await db
      .select({ id: candidates.id, vacancyId: candidates.vacancyId, stage: candidates.stage })
      .from(candidates)
      .where(and(
        sql`${candidates.stage} IN ('rejected', 'hired')`,
        eq(candidates.autoProcessingStopped, false),
        eq(candidates.automationPaused, false),
        isNull(candidates.deletedAt),
      ))
      .limit(500)
    findings.terminalStageWithoutStopFlags = rows.slice(0, MAX_EXAMPLES).map(r => ({
      candidateId: r.id,
      vacancyId:   r.vacancyId,
      detail:      `stage=${r.stage}, autoProcessingStopped=false, automationPaused=false`,
    }))
    ;(findings as unknown as Record<string, unknown>).terminalStageWithoutStopFlagsCount = rows.length
  }

  // ── 4) funnelV2StateJson.stageId vs candidates.stage ───────────────────────
  {
    const rows = await db
      .select({
        id:               candidates.id,
        vacancyId:        candidates.vacancyId,
        stage:            candidates.stage,
        funnelV2StateJson: candidates.funnelV2StateJson,
      })
      .from(candidates)
      .where(and(
        isNotNull(candidates.funnelV2StateJson),
        isNull(candidates.deletedAt),
      ))
      .limit(2000)

    // Собираем нужные vacancyId одним проходом, тянем funnelV2-конфиг батчем.
    const vacancyIds = Array.from(new Set(rows.map(r => r.vacancyId)))
    const vacRows = vacancyIds.length > 0
      ? await db
          .select({ id: vacancies.id, descriptionJson: vacancies.descriptionJson })
          .from(vacancies)
          .where(inArray(vacancies.id, vacancyIds))
      : []
    const stageActionByVacancy = new Map<string, Map<string, StageActionType>>()
    for (const v of vacRows) {
      const desc = v.descriptionJson as { funnelV2?: { stages?: Array<{ id?: string; action?: string }> } } | null
      const stages = desc?.funnelV2?.stages
      if (!Array.isArray(stages)) continue
      const m = new Map<string, StageActionType>()
      for (const s of stages) {
        if (s && typeof s.id === "string" && typeof s.action === "string") {
          m.set(s.id, s.action as StageActionType)
        }
      }
      stageActionByVacancy.set(v.id, m)
    }

    let mismatchCount = 0
    const examples: Finding[] = []
    for (const r of rows) {
      const state = r.funnelV2StateJson as FunnelV2State | null
      if (!state?.stageId) continue
      const actionMap = stageActionByVacancy.get(r.vacancyId)
      const action = actionMap?.get(state.stageId)
      if (!action) continue // конфиг стадии не найден (удалена/старая) — не считаем противоречием
      const expectedLegacy = ACTION_TO_LEGACY_STAGE[action]
      if (!expectedLegacy) continue // action без legacy-эквивалента (message/security_check и т.п. вне карты)
      if (r.stage !== expectedLegacy) {
        mismatchCount++
        if (examples.length < MAX_EXAMPLES) {
          examples.push({
            candidateId: r.id,
            vacancyId:   r.vacancyId,
            detail:      `stage=${r.stage}, funnelV2.stageId=${state.stageId} (action=${action} → ожидали stage=${expectedLegacy})`,
          })
        }
      }
    }
    findings.v2StageIdLegacyMismatch = examples
    ;(findings as unknown as Record<string, unknown>).v2StageIdLegacyMismatchCount = mismatchCount
  }

  // ── 5) просроченный pendingRejectionAt, кандидат всё ещё не rejected ───────
  {
    const rows = await db
      .select({ id: candidates.id, vacancyId: candidates.vacancyId, pendingRejectionAt: candidates.pendingRejectionAt, stage: candidates.stage })
      .from(candidates)
      .where(and(
        isNotNull(candidates.pendingRejectionAt),
        sql`${candidates.pendingRejectionAt} < now() - interval '24 hours'`,
        sql`${candidates.stage} NOT IN ('rejected', 'hired')`,
        isNull(candidates.deletedAt),
      ))
      .limit(500)
    findings.overdueRejectionStuck = rows.slice(0, MAX_EXAMPLES).map(r => ({
      candidateId: r.id,
      vacancyId:   r.vacancyId,
      detail:      `stage=${r.stage}, pendingRejectionAt=${r.pendingRejectionAt?.toISOString() ?? "?"} (>24ч просрочено)`,
    }))
    ;(findings as unknown as Record<string, unknown>).overdueRejectionStuckCount = rows.length
  }

  return findings
}

async function handle(req: NextRequest) {
  const auth = checkCronAuth(req)
  if (!auth.ok) return auth.response

  const lastOk = await lastSuccessfulRunAt()
  if (lastOk && Date.now() - lastOk.getTime() < MIN_COOLDOWN_MS) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "too_recent",
      lastOk: lastOk.toISOString(),
    })
  }

  const run = await startCronRun(CRON_NAME).catch(() => null)
  const startedAt = Date.now()

  try {
    const findings = await run_()
    const durationMs = Date.now() - startedAt

    const summary = {
      primaryContactWithPendingRejectionCount: (findings as unknown as Record<string, unknown>).primaryContactWithPendingRejectionCount,
      prequalPendingStageMismatchCount:        (findings as unknown as Record<string, unknown>).prequalPendingStageMismatchCount,
      terminalStageWithoutStopFlagsCount:       (findings as unknown as Record<string, unknown>).terminalStageWithoutStopFlagsCount,
      v2StageIdLegacyMismatchCount:             (findings as unknown as Record<string, unknown>).v2StageIdLegacyMismatchCount,
      overdueRejectionStuckCount:               (findings as unknown as Record<string, unknown>).overdueRejectionStuckCount,
      durationMs,
    }

    const meta = {
      ...summary,
      examples: {
        primaryContactWithPendingRejection: findings.primaryContactWithPendingRejection,
        prequalPendingStageMismatch:        findings.prequalPendingStageMismatch,
        terminalStageWithoutStopFlags:      findings.terminalStageWithoutStopFlags,
        v2StageIdLegacyMismatch:            findings.v2StageIdLegacyMismatch,
        overdueRejectionStuck:              findings.overdueRejectionStuck,
      },
    }

    console.log(JSON.stringify({ tag: "cron/b9-status-sanity", ...summary, ts: new Date().toISOString() }))
    if (run) await finishCronRun(run.id, "ok", meta)
    return NextResponse.json({ ok: true, ...summary })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (run) await finishCronRun(run.id, "error", null, msg)
    console.error("[cron/b9-status-sanity] fatal:", msg)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function GET(req: NextRequest)  { return handle(req) }
export async function POST(req: NextRequest) { return handle(req) }
