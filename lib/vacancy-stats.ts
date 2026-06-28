// #13/#14: единая функция статистики вакансии. Цель — один источник
// истины для шапки страницы вакансии, таба «Аналитика» и дашборда
// найма. Раньше каждый из них считал по-своему, и цифры расходились
// (особенно аналитика — она использовала пагинированный клиентский
// columns, в шапке был отдельный SQL, в дашборде — третий вариант).

import { and, eq, inArray, isNotNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies, hhResponses } from "@/lib/db/schema"
import {
  ALL_STAGE_SLUGS,
  IN_PROGRESS_STAGE_SLUGS,
  ANKETA_FILLED_STAGE_SLUGS,
  DEMO_OPENED_STAGE_SLUGS,
  type StageSlug,
} from "@/lib/stages"

export interface VacancyStats {
  // hh.ru блок — синхронизированы с hh-кабинетом.
  hhTotal:        number
  hhNew:          number
  hhLastSyncAt:   string | null
  // Наши данные после разбора.
  total:          number
  inProgress:     number
  rejected:       number
  hired:          number
  demoOpened:     number
  anketaFilled:   number
  // Кандидаты, ответившие на вопросы демо (demo_answers_score посчитан).
  demoAnswered:   number
  // Детализация по стадиям (slug → count) — для аналитики/воронки.
  byStage:        Record<string, number>
  // Конверсии. Все в процентах [0..100], округлены до 1 знака.
  conversions: {
    demoOpenRate:     number  // demoOpened / total
    anketaFillRate:   number  // anketaFilled / demoOpened
    hiredRate:        number  // hired / total
  }
}

function pct(numerator: number, denominator: number): number {
  if (!denominator) return 0
  return Math.round((numerator / denominator) * 1000) / 10
}

// Серверная функция. Не имеет авторизации — auth/owner check делает caller.
export async function getVacancyStats(vacancyId: string): Promise<VacancyStats> {
  const [vac] = await db
    .select({ companyId: vacancies.companyId, hhVacancyId: vacancies.hhVacancyId })
    .from(vacancies)
    .where(eq(vacancies.id, vacancyId))
    .limit(1)
  if (!vac) {
    return emptyStats()
  }

  // Один запрос — count GROUP BY stage. Даёт byStage + базовые counts.
  const byStageRows = await db
    .select({
      stage: candidates.stage,
      cnt:   sql<number>`count(*)::int`,
    })
    .from(candidates)
    .where(eq(candidates.vacancyId, vacancyId))
    .groupBy(candidates.stage)

  const byStage: Record<string, number> = {}
  let total = 0
  for (const row of byStageRows) {
    const key = row.stage ?? "new"
    byStage[key] = row.cnt
    total += row.cnt
  }
  // Заполняем нулями недостающие slug'и — UI ожидает full set.
  for (const s of ALL_STAGE_SLUGS) {
    if (!(s in byStage)) byStage[s] = 0
  }

  const sumByGroup = (group: StageSlug[]) =>
    group.reduce((a, s) => a + (byStage[s] ?? 0), 0)

  const inProgress   = sumByGroup(IN_PROGRESS_STAGE_SLUGS)
  const rejected     = byStage["rejected"] ?? 0
  const hired        = byStage["hired"] ?? 0
  const demoOpened   = sumByGroup(DEMO_OPENED_STAGE_SLUGS)
  const anketaFilled = sumByGroup(ANKETA_FILLED_STAGE_SLUGS)

  // Ответившие на вопросы демо — у кого посчитан demo_answers_score.
  const [demoAnsweredRow] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(candidates)
    .where(and(
      eq(candidates.vacancyId, vacancyId),
      isNotNull(candidates.demoAnswersScore),
    ))
  const demoAnswered = demoAnsweredRow?.c ?? 0

  // hh.ru данные — из hh_responses (кеш, обновляется через /api/cron/hh-import).
  let hhTotal = 0
  let hhNew   = 0
  let hhLastSyncAt: string | null = null
  if (vac.hhVacancyId) {
    const [hhRows, lastSync] = await Promise.all([
      db.select({
          status: hhResponses.status,
          cnt:    sql<number>`count(*)::int`,
        })
        .from(hhResponses)
        .where(and(
          eq(hhResponses.companyId, vac.companyId),
          eq(hhResponses.hhVacancyId, vac.hhVacancyId),
        ))
        .groupBy(hhResponses.status),
      db.select({ at: sql<Date>`MAX(${hhResponses.syncedAt})` })
        .from(hhResponses)
        .where(and(
          eq(hhResponses.companyId, vac.companyId),
          eq(hhResponses.hhVacancyId, vac.hhVacancyId),
        ))
        .limit(1),
    ])
    for (const row of hhRows) {
      hhTotal += row.cnt
      // #45: 'claimed' — промежуточный статус («забран в обработку, ещё
      // не отправлен»). Считаем его как «новый», чтобы счётчик в шапке
      // уменьшался в темпе реальной отправки, а не моментально после
      // клейма всего батча.
      if (row.status === "response" || row.status === "claimed") hhNew += row.cnt
    }
    const at = lastSync?.[0]?.at
    hhLastSyncAt = at ? new Date(at).toISOString() : null
  }

  return {
    hhTotal, hhNew, hhLastSyncAt,
    total, inProgress, rejected, hired, demoOpened, anketaFilled, demoAnswered,
    byStage,
    conversions: {
      demoOpenRate:   pct(demoOpened, total),
      anketaFillRate: pct(anketaFilled, demoOpened),
      hiredRate:      pct(hired, total),
    },
  }
}

// Bulk-версия для дашборда — один запрос на все vacancyId сразу.
// Использует группировку по (vacancyId, stage). Для hh-метрик отдельный
// проход, потому что они привязаны к hh_vacancy_id (string), а не к
// vacancies.id (uuid).
export async function getVacancyStatsBulk(
  vacancyIds: string[],
): Promise<Map<string, VacancyStats>> {
  if (vacancyIds.length === 0) return new Map()

  const rows = await db
    .select({
      vacancyId: candidates.vacancyId,
      stage:     candidates.stage,
      cnt:       sql<number>`count(*)::int`,
    })
    .from(candidates)
    .where(inArray(candidates.vacancyId, vacancyIds))
    .groupBy(candidates.vacancyId, candidates.stage)

  // Ответившие на вопросы демо — отдельный count по вакансиям.
  const demoAnsweredRows = await db
    .select({
      vacancyId: candidates.vacancyId,
      cnt:       sql<number>`count(*)::int`,
    })
    .from(candidates)
    .where(and(
      inArray(candidates.vacancyId, vacancyIds),
      isNotNull(candidates.demoAnswersScore),
    ))
    .groupBy(candidates.vacancyId)
  const demoAnsweredByVacancy = new Map<string, number>()
  for (const r of demoAnsweredRows) demoAnsweredByVacancy.set(r.vacancyId, r.cnt)

  // hh-stats fetched per-vacancy on demand. Bulk-версия hh не делает,
  // чтобы не таскать все hh_responses в одном запросе. Возвращаем
  // hh-блок нулями (если caller хочет — отдельно дёрнет getVacancyStats
  // на нужные vacancyId).
  const out = new Map<string, VacancyStats>()
  for (const id of vacancyIds) out.set(id, emptyStats())

  for (const r of rows) {
    const s = out.get(r.vacancyId)
    if (!s) continue
    const stage = r.stage ?? "new"
    s.byStage[stage] = (s.byStage[stage] ?? 0) + r.cnt
    s.total += r.cnt
  }

  // Recompute grouped metrics for each vacancy.
  for (const [id, stats] of out.entries()) {
    const sumByGroup = (group: StageSlug[]) =>
      group.reduce((a, s) => a + (stats.byStage[s] ?? 0), 0)
    stats.inProgress   = sumByGroup(IN_PROGRESS_STAGE_SLUGS)
    stats.rejected     = stats.byStage["rejected"] ?? 0
    stats.hired        = stats.byStage["hired"] ?? 0
    stats.demoOpened   = sumByGroup(DEMO_OPENED_STAGE_SLUGS)
    stats.anketaFilled = sumByGroup(ANKETA_FILLED_STAGE_SLUGS)
    stats.demoAnswered = demoAnsweredByVacancy.get(id) ?? 0
    stats.conversions = {
      demoOpenRate:   pct(stats.demoOpened, stats.total),
      anketaFillRate: pct(stats.anketaFilled, stats.demoOpened),
      hiredRate:      pct(stats.hired, stats.total),
    }
  }

  return out
}

function emptyStats(): VacancyStats {
  const byStage: Record<string, number> = {}
  for (const s of ALL_STAGE_SLUGS) byStage[s] = 0
  return {
    hhTotal: 0, hhNew: 0, hhLastSyncAt: null,
    total: 0, inProgress: 0, rejected: 0, hired: 0,
    demoOpened: 0, anketaFilled: 0, demoAnswered: 0,
    byStage,
    conversions: { demoOpenRate: 0, anketaFillRate: 0, hiredRate: 0 },
  }
}
