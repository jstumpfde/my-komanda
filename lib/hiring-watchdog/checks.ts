// «Сторож найма» (Юрий 07.07) — DB-touching проверки. Чистая классификация
// (пороги/сообщения/dedup) вынесена в ./classify.ts и юнит-тестируется без БД;
// этот файл только читает БД, вызывает готовые чистые функции и делает
// безопасные авто-починки. Вызывается из app/api/cron/hiring-watchdog/route.ts.

import { and, eq, lt, gte, inArray, sql, desc, ne } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  vacancies,
  hhVacancies,
  hhIntegrations,
  hhResponses,
  candidates,
  followUpMessages,
  cronRuns,
  aiCallFailures,
} from "@/lib/db/schema"
import { getValidToken } from "@/lib/hh-helpers"
import {
  classifyHhToken,
  classifyImportStale,
  classifyStuckQueue,
  classifySendFailures,
  classifyOldPublicationCleanup,
  classifyCronStale,
  classifyAiScoringStuck,
  classifyAiOutageSpike,
  classifyBlindInviteNoScore,
  hhTokenDeadDedupKey,
  minutesSince,
  type WatchdogIssue,
} from "./classify"
import { checkHhStageMismatch, HH_STAGE_MISMATCH_DEDUP_PREFIX } from "./hh-reconcile"

const STUCK_QUEUE_HOURS = 4
const SEND_FAILURES_WINDOW_MINUTES = 60
const SEND_FAILURES_THRESHOLD = 5
const AI_SCORING_STUCK_WINDOW_HOURS = 24
const AI_SCORING_STUCK_THRESHOLD = 3
const IMPORT_STALE_THRESHOLD_MINUTES = 60
const FOLLOW_UP_STALE_THRESHOLD_MINUTES = 30
const PENDING_REJECTIONS_STALE_THRESHOLD_MINUTES = 120
const FUNNEL_V2_TICK_STALE_THRESHOLD_MINUTES = 30
const AI_OUTAGE_WINDOW_MINUTES = 15
const AI_OUTAGE_THRESHOLD = 5
const BLIND_INVITE_WINDOW_MIN_HOURS = 1   // не считаем совсем свежих — дай гейту шанс отработать нормально
const BLIND_INVITE_WINDOW_MAX_HOURS = 48  // не тащим весь исторический шум
const BLIND_INVITE_THRESHOLD = 5

export interface WatchdogRunResult {
  issues: WatchdogIssue[]
  fixes: {
    oldPublicationCancelled: number
  }
}

// ─── Компании с активными hh-вакансиями (auto_processing_enabled=true) ─────
// Тот же скоуп, что использует /api/cron/hh-import — компании, у которых
// вообще есть смысл проверять hh-соединение и импорт.
async function listCompaniesWithActiveHh(): Promise<Array<{ companyId: string }>> {
  const rows = await db
    .select({ companyId: vacancies.companyId })
    .from(hhVacancies)
    .innerJoin(vacancies, eq(hhVacancies.localVacancyId, vacancies.id))
    .where(and(
      inArray(hhVacancies.status, ["active", "open"]),
      eq(vacancies.autoProcessingEnabled, true),
    ))
  const seen = new Set<string>()
  const result: Array<{ companyId: string }> = []
  for (const r of rows) {
    if (seen.has(r.companyId)) continue
    seen.add(r.companyId)
    result.push({ companyId: r.companyId })
  }
  return result
}

// ─── Проверка 1: hh-токен протух и не рефрешится ───────────────────────────
async function checkHhToken(companyId: string): Promise<WatchdogIssue[]> {
  const [integration] = await db
    .select({ isActive: hhIntegrations.isActive })
    .from(hhIntegrations)
    .where(eq(hhIntegrations.companyId, companyId))
    .limit(1)

  // getValidToken делает реальную попытку (включая рефреш) — используем её,
  // чтобы не дублировать логику рефреша здесь. Если она успешно вернула
  // токен, значит либо всё ок, либо только что сама починила (refreshed).
  const tokenResult = await getValidToken(companyId).catch(() => null)
  if (tokenResult) return []

  const issue = classifyHhToken(integration ?? null)
  if (!issue) return []
  return [{ ...issue, dedupKey: hhTokenDeadDedupKey(companyId), companyId }]
}

// ─── Проверка 2: импорт откликов не бежал > 60 мин (платформенная) ─────────
async function checkHhImportFreshness(): Promise<WatchdogIssue[]> {
  const [row] = await db
    .select({ finishedAt: cronRuns.finishedAt })
    .from(cronRuns)
    .where(and(eq(cronRuns.cronName, "hh-import"), eq(cronRuns.status, "ok")))
    .orderBy(desc(cronRuns.startedAt))
    .limit(1)
  const issue = classifyImportStale(minutesSince(row?.finishedAt ?? null), IMPORT_STALE_THRESHOLD_MINUTES)
  return issue ? [issue] : []
}

// ─── Проверка 3: застрявший разбор (только диагностика, БЕЗ авто-починки) ──
// Авто-сброс claimed УБРАН на ревью координатора (07.07): у hh_responses НЕТ
// отметки времени клейма — created_at это дата ОТКЛИКА, и почти все отклики
// старше 4ч по нему. Сброс по этому критерию ловил бы отклики, взятые
// очередью в работу минуту назад (обработка одного кандидата с задержками
// легально идёт минуты) → гонка со scan/process-queue и ДВОЙНАЯ отправка
// первого сообщения кандидату. Безопасного критерия без новой колонки
// claimed_at не существует — поэтому response+claimed старше 4ч только
// СЧИТАЕМ и поднимаем warning (HR/админ разберётся); зависшие claimed чинит
// error-recovery самого process-queue. Колонка claimed_at + авто-починка —
// бэклог. Скоуп — ТОЛЬКО вакансии с auto_processing_enabled=true (иначе
// нормально, что отклики лежат необработанными долго — HR разбирает вручную).
// НЕ дублируем orphaned-логику hh-cleanup-stuck — это про другое (там
// candidate уже терминальный).
async function checkStuckQueue(): Promise<WatchdogIssue[]> {
  const cutoff = new Date(Date.now() - STUCK_QUEUE_HOURS * 60 * 60 * 1000)

  const stuckResponseRows = await db
    .select({
      hhVacancyId: hhResponses.hhVacancyId,
      companyId:   hhResponses.companyId,
      cnt:         sql<number>`count(*)::int`,
    })
    .from(hhResponses)
    .where(and(inArray(hhResponses.status, ["response", "claimed"]), lt(hhResponses.createdAt, cutoff)))
    .groupBy(hhResponses.hhVacancyId, hhResponses.companyId)

  if (stuckResponseRows.length === 0) return []

  // hh_responses.hhVacancyId — hh-идентификатор публикации, не наш vacancyId.
  // Матчим на vacancies с auto_processing_enabled=true через hh_vacancy_id ИЛИ
  // hh_vacancies.hh_vacancy_id (см. тот же приоритет, что и в hh-import).
  const hhVacIds = [...new Set(stuckResponseRows.map((r) => r.hhVacancyId))]
  if (hhVacIds.length === 0) return []

  const activeVacRows = await db
    .select({ id: vacancies.id, hhVacancyId: vacancies.hhVacancyId, companyId: vacancies.companyId })
    .from(vacancies)
    .where(and(inArray(vacancies.hhVacancyId, hhVacIds), eq(vacancies.autoProcessingEnabled, true)))
  const vacByHhId = new Map(activeVacRows.map((v) => [v.hhVacancyId, v]))

  const issues: WatchdogIssue[] = []
  for (const row of stuckResponseRows) {
    const vac = vacByHhId.get(row.hhVacancyId)
    if (!vac) continue // вакансия не найдена/авто-разбор выключен — не наша забота
    const issue = classifyStuckQueue(vac.id, vac.companyId, row.cnt)
    if (issue) issues.push(issue)
  }
  return issues
}

// ─── Проверка 4а: отправки — много failed за час (warning) ─────────────────
async function checkSendFailures(): Promise<WatchdogIssue[]> {
  const since = new Date(Date.now() - SEND_FAILURES_WINDOW_MINUTES * 60_000)
  const rows = await db
    .select({
      vacancyId: candidates.vacancyId,
      companyId: vacancies.companyId,
      errorMessage: followUpMessages.errorMessage,
    })
    .from(followUpMessages)
    .innerJoin(candidates, eq(followUpMessages.candidateId, candidates.id))
    .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
    .where(and(
      eq(followUpMessages.status, "failed"),
      eq(followUpMessages.channel, "hh"),
      gte(followUpMessages.sentAt, since),
    ))

  const byVacancy = new Map<string, { companyId: string; total: number; reasons: Map<string, number> }>()
  for (const r of rows) {
    const entry = byVacancy.get(r.vacancyId) ?? { companyId: r.companyId, total: 0, reasons: new Map() }
    entry.total++
    const reason = (r.errorMessage ?? "unknown").slice(0, 40)
    entry.reasons.set(reason, (entry.reasons.get(reason) ?? 0) + 1)
    byVacancy.set(r.vacancyId, entry)
  }

  const issues: WatchdogIssue[] = []
  for (const [vacancyId, entry] of byVacancy.entries()) {
    const breakdown = [...entry.reasons.entries()].map(([reason, count]) => ({ reason, count }))
    const issue = classifySendFailures(vacancyId, entry.companyId, entry.total, breakdown, SEND_FAILURES_THRESHOLD)
    if (issue) issues.push(issue)
  }
  return issues
}

// ─── Проверка 4б: старая публикация — авто-починка (отмена недоставляемых) ─
// Инцидент 07.07 (вакансия 6916db01, координатор чинил вручную): перепубликация
// вакансии на hh меняет vacancies.hh_vacancy_id. Кандидаты, чей ЕДИНСТВЕННЫЙ
// hh_response привязан к СТАРОМУ hh_vacancy_id (не совпадает с текущим),
// сидят в закрытом hh-чате — сообщения туда не доходят (invalid_vacancy).
// НЕ трогаем кандидатов, у которых есть хотя бы один hh_response с ТЕКУЩИМ
// hh_vacancy_id (более новый отклик после переоткликнулся на новую публикацию).
async function checkAndFixOldPublication(): Promise<{ issues: WatchdogIssue[]; cancelledTotal: number }> {
  // Вакансии с hh-привязкой, у которых есть failed follow_up_messages с
  // invalid_vacancy за последние 24ч — сигнал, что перепубликация случилась
  // и кто-то уже поймал ошибку. Ограничиваем скоуп только такими вакансиями,
  // чтобы не гонять тяжёлый запрос по всей базе на каждый тик.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const flagged = await db
    .select({ vacancyId: candidates.vacancyId, companyId: vacancies.companyId, hhVacancyId: vacancies.hhVacancyId })
    .from(followUpMessages)
    .innerJoin(candidates, eq(followUpMessages.candidateId, candidates.id))
    .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
    .where(and(
      eq(followUpMessages.status, "failed"),
      sql`${followUpMessages.errorMessage} ILIKE ${"%invalid_vacancy%"}`,
      gte(followUpMessages.sentAt, since),
    ))
    .groupBy(candidates.vacancyId, vacancies.companyId, vacancies.hhVacancyId)

  if (flagged.length === 0) return { issues: [], cancelledTotal: 0 }

  const issues: WatchdogIssue[] = []
  let cancelledTotal = 0

  for (const vac of flagged) {
    if (!vac.hhVacancyId) continue

    // Кандидаты этой вакансии, у КОТОРЫХ ЕСТЬ отклик на ТЕКУЩУЮ публикацию —
    // их НЕ трогаем (переоткликнулись, чат живой).
    const candidatesOnCurrent = await db
      .selectDistinct({ candidateId: hhResponses.localCandidateId })
      .from(hhResponses)
      .where(and(
        eq(hhResponses.hhVacancyId, vac.hhVacancyId),
        eq(hhResponses.companyId, vac.companyId),
      ))
    const currentIds = new Set(candidatesOnCurrent.map((c) => c.candidateId).filter((id): id is string => !!id))

    // Все кандидаты вакансии с pending-дожимами.
    const pendingTouches = await db
      .select({ id: followUpMessages.id, candidateId: followUpMessages.candidateId })
      .from(followUpMessages)
      .innerJoin(candidates, eq(followUpMessages.candidateId, candidates.id))
      .where(and(eq(candidates.vacancyId, vac.vacancyId), eq(followUpMessages.status, "pending")))

    const onlyOldPublicationIds = pendingTouches
      .filter((t) => !currentIds.has(t.candidateId))
      .map((t) => t.id)

    if (onlyOldPublicationIds.length === 0) continue

    await db
      .update(followUpMessages)
      .set({
        status: "cancelled",
        errorMessage: `old_publication_chat_closed: hh_vacancy_id changed, was serving old publication (watchdog auto-fix ${new Date().toISOString()})`,
      })
      .where(inArray(followUpMessages.id, onlyOldPublicationIds))

    cancelledTotal += onlyOldPublicationIds.length
    const issue = classifyOldPublicationCleanup(vac.vacancyId, vac.companyId, onlyOldPublicationIds.length)
    if (issue) issues.push(issue)
  }

  return { issues, cancelledTotal }
}

// ─── Проверка 5: кроны живы (платформенные, только если есть работа) ──────
async function lastOkRun(cronName: string): Promise<Date | null> {
  const [row] = await db
    .select({ finishedAt: cronRuns.finishedAt })
    .from(cronRuns)
    .where(and(eq(cronRuns.cronName, cronName), eq(cronRuns.status, "ok")))
    .orderBy(desc(cronRuns.startedAt))
    .limit(1)
  return row?.finishedAt ?? null
}

async function checkCronsAlive(): Promise<WatchdogIssue[]> {
  const issues: WatchdogIssue[] = []

  // follow-up: с guard-фикса 07.07 пишет в cron_runs КАЖДЫЙ прогон (даже при
  // 0 отправок — все touches вне рабочего окна это легальный пустой прогон),
  // поэтому живость проверяем так же, как pending-rejections/funnel-v2-tick —
  // по свежести последнего успешного прогона. Прежний прокси по sentAt
  // последнего sent/failed давал ложный CRITICAL каждый тихий вечер/выходной:
  // canSendNow намеренно держит touches в pending вне окна, отправок нет,
  // но крон при этом жив.
  const [pendingCount] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(followUpMessages)
    .where(and(eq(followUpMessages.status, "pending"), lt(followUpMessages.scheduledAt, new Date())))
  const hasFollowUpWork = (pendingCount?.c ?? 0) > 0
  {
    const last = await lastOkRun("follow-up")
    const issue = classifyCronStale("follow-up", minutesSince(last), FOLLOW_UP_STALE_THRESHOLD_MINUTES, hasFollowUpWork)
    if (issue) issues.push(issue)
  }

  // pending-rejections: пишет в cron_runs, есть работа = pending_rejection_at наступил.
  const [pendingRejCount] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(candidates)
    .where(and(
      sql`${candidates.pendingRejectionAt} IS NOT NULL`,
      lt(candidates.pendingRejectionAt, new Date()),
      ne(candidates.stage, "rejected"),
    ))
  const hasPendingRejWork = (pendingRejCount?.c ?? 0) > 0
  {
    const last = await lastOkRun("pending-rejections")
    const issue = classifyCronStale(
      "pending-rejections",
      minutesSince(last),
      PENDING_REJECTIONS_STALE_THRESHOLD_MINUTES,
      hasPendingRejWork,
    )
    if (issue) issues.push(issue)
  }

  // funnel-v2-tick: пишет в cron_runs, есть работа = активные v2-кандидаты.
  const [v2Count] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(candidates)
    .where(sql`${candidates.funnelV2StateJson} IS NOT NULL`)
  const hasV2Work = (v2Count?.c ?? 0) > 0
  {
    const last = await lastOkRun("funnel-v2-tick")
    const issue = classifyCronStale("funnel-v2-tick", minutesSince(last), FUNNEL_V2_TICK_STALE_THRESHOLD_MINUTES, hasV2Work)
    if (issue) issues.push(issue)
  }

  return issues
}

// ─── Проверка 6: AI-скоринг сбоит (per company, 24ч) ───────────────────────
async function checkAiScoringStuck(companyId: string): Promise<WatchdogIssue[]> {
  const since = new Date(Date.now() - AI_SCORING_STUCK_WINDOW_HOURS * 60 * 60 * 1000)
  const [row] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(candidates)
    .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
    .where(and(
      eq(vacancies.companyId, companyId),
      eq(candidates.autoProcessingStoppedReason, "entry_gate_ai_scoring_stuck"),
      gte(candidates.autoProcessingStoppedAt, since),
    ))
  const issue = classifyAiScoringStuck(companyId, row?.c ?? 0, AI_SCORING_STUCK_THRESHOLD)
  return issue ? [issue] : []
}

// ─── Проверка 7: массовый сбой AI-вызовов (платформенная, короткое окно) ───
// Читает ai_call_failures (lib/ai/failure-log.ts) — структурированный лог
// сбоев, добавленный 13.07 в screenResume/scoreResumeByAxes/scoreTestSubmission/
// scoreCandidateV2/scoreDemoAnswers. В отличие от checkAiScoringStuck (per-
// company, порог за 24ч, только для вакансий с настроенным входным гейтом) —
// этот сигнал платформенный и быстрый (10-15 мин), чтобы поймать «лимит
// Anthropic исчерпан» в течение одного тика крона, а не через часы простоя.
async function checkAiOutageSpike(): Promise<WatchdogIssue[]> {
  const since = new Date(Date.now() - AI_OUTAGE_WINDOW_MINUTES * 60_000)
  const [row] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(aiCallFailures)
    .where(gte(aiCallFailures.createdAt, since))
  const issue = classifyAiOutageSpike(row?.c ?? 0, AI_OUTAGE_WINDOW_MINUTES, AI_OUTAGE_THRESHOLD)
  return issue ? [issue] : []
}

// ─── Проверка 8: «слепой инвайт» без resume_score (платформенная) ──────────
// Вакансии БЕЗ настроенного входного гейта при сбое AI-скоринга сохраняют
// legacy-поведение — приглашение уходит без балла (см. комментарий «слепой
// инвайт при сбое AI» в lib/hh/process-queue.ts). Такой кандидат НЕ получает
// entry_gate_ai_scoring_stuck (та причина ставится только когда гейт
// настроен) — невидим для checkAiScoringStuck. Грубый платформенный
// индикатор по буквальному условию задачи: окно 1-48ч (не совсем свежие —
// дать гейту время, не весь исторический шум).
async function checkBlindInviteNoScore(): Promise<WatchdogIssue[]> {
  const newerThan = new Date(Date.now() - BLIND_INVITE_WINDOW_MAX_HOURS * 60 * 60 * 1000)
  const olderThan = new Date(Date.now() - BLIND_INVITE_WINDOW_MIN_HOURS * 60 * 60 * 1000)
  const [row] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(candidates)
    .where(and(
      ne(candidates.stage, "new"),
      sql`${candidates.resumeScore} IS NULL`,
      lt(candidates.createdAt, olderThan),
      gte(candidates.createdAt, newerThan),
    ))
  const issue = classifyBlindInviteNoScore(row?.c ?? 0, BLIND_INVITE_THRESHOLD)
  return issue ? [issue] : []
}

// ─── Оркестрация одного полного прогона ────────────────────────────────────
export async function runHiringWatchdog(): Promise<WatchdogRunResult> {
  const companiesList = await listCompaniesWithActiveHh()
  const issues: WatchdogIssue[] = []

  // Платформенные проверки — не зависят от конкретной компании.
  issues.push(...(await checkHhImportFreshness()))
  issues.push(...(await checkCronsAlive()))

  issues.push(...(await checkStuckQueue()))

  const oldPub = await checkAndFixOldPublication()
  issues.push(...oldPub.issues)

  issues.push(...(await checkSendFailures()))

  // Быстрый платформенный детектор массового сбоя AI (13.07) — короткое окно,
  // должен бежать каждый тик независимо от компаний со включённым hh.
  issues.push(...(await checkAiOutageSpike()))
  issues.push(...(await checkBlindInviteNoScore()))

  // Сверка «наша стадия vs реальная hh-папка» (13.07) — делает реальные
  // HTTP-запросы к hh (до 20 кандидатов за прогон, anti-429 пауза между
  // запросами), поэтому идёт последней в платформенном блоке.
  issues.push(...(await checkHhStageMismatch()))

  // Per-company проверки: hh-токен + AI-скоринг.
  for (const { companyId } of companiesList) {
    issues.push(...(await checkHhToken(companyId)))
    issues.push(...(await checkAiScoringStuck(companyId)))
  }

  return {
    issues,
    fixes: {
      oldPublicationCancelled: oldPub.cancelledTotal,
    },
  }
}

// Скоуп dedup-префиксов для авто-resolve — по одному на каждую категорию
// проверки, реально выполненную в runHiringWatchdog(). Если когда-нибудь
// прогон станет частичным (например, по одной компании) — этот список нужно
// сузить, иначе авто-resolve закроет алерты категорий, которые не проверялись.
export const WATCHDOG_DEDUP_PREFIXES = [
  "hh_token_dead:",
  "hh_import_stale",
  "stuck_queue:",
  "send_failures:",
  "cron_stale:",
  "ai_scoring_stuck:",
  "ai_outage_spike",
  "blind_invite_no_score",
  HH_STAGE_MISMATCH_DEDUP_PREFIX,
  // old_publication_cleanup — info, каждый прогон уникальный суффикс, в
  // авто-resolve не участвует (не остаётся "open" долго).
]
