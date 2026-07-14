// ─── Входящий синк стадий hh → платформа (#23) ───────────────────────────────
//
// Читает актуальное negotiation-состояние кандидатов на hh и, если оно
// маппится в НАШУ стадию (hhStateToPlatformStage != null) и отличается от
// текущей — двигает нашу стадию кандидата. Отказ кандидата (discard_by_applicant)
// проставляет rejectionInitiator=candidate.
//
// Только ВХОДЯЩИЙ: hh — источник правды о том, что HR сделал руками в интерфейсе
// hh (перевёл в «Тестовое», отказал) или что сделал кандидат (сам отклонил).
//
// Идемпотентно: если hh-состояние уже совпадает с нашей стадией — ничего не
// делаем. Если у hh-состояния нет нашего эквивалента (map=null) — fallback
// «оставить предыдущий» (не трогаем).
//
// ГАРД: вакансии без валидного hh-токена (на стейджинге токены отключены /
// isActive=false → getValidToken=null) пропускаются без краша.
//
// НЕ откатывает терминальные стадии: если у нас уже hired/started_work —
// входящий сигнал не двигает назад (кроме отказа: hh-discard → rejected всегда
// имеет приоритет, т.к. отклик реально закрыт на hh).

import { and, desc, eq, isNull, isNotNull, or, ne } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies, hhResponses, hhCandidates } from "@/lib/db/schema"
import { getValidToken } from "@/lib/hh-helpers"
import {
  hhStateToPlatformStage,
  isCandidateInitiatedDiscard,
  type HhNegotiationState,
} from "@/lib/hh/stage-mapping"
import { PLATFORM_STAGES, type StageSlug } from "@/lib/stages"

const HH_API_BASE = "https://api.hh.ru"
const USER_AGENT = "Company24/1.0 (company24.pro)"
const HH_FETCH_TIMEOUT_MS = 15_000
const PER_CANDIDATE_DELAY_MS = 200 // вежливо к rate-limit hh

// Стадии, которые НЕ откатываем входящим сигналом (кроме отказа).
// Используется как fallback, когда порядок текущей стадии в каноне неизвестен
// (экзотический/side-slug). Основная защита — сравнение по каноническому
// порядку (см. shouldMoveForward ниже).
// talent_pool/pending (predeploy-guard 14.07) — живые ручные side-branch
// стадии (кнопки «В резерв»/«Подумаем», авто-резерв funnel-v2 score-gate) —
// у них нет канонического sortOrder (не входят в PLATFORM_STAGES/
// LEGACY_STAGE_ALIAS), поэтому без явной защиты попадали в permissive
// fallback ниже и утекали в тот же класс регрессии, что и demo_opened.
const NON_REGRESSABLE = new Set(["hired", "started_work", "rejected", "talent_pool", "pending"])

// Legacy-slug'и второй системы статусов (см. lib/stages.ts LEGACY_STAGE_LABELS)
// приводим к каноническому «родственнику», чтобы сравнение порядка работало и
// для исторических кандидатов, а не только для канонических стадий.
const LEGACY_STAGE_ALIAS: Record<string, StageSlug> = {
  demo: "demo_opened",
  interviewed: "interview",
  final_decision: "decision",
  offer: "offer_sent",
  preboarding: "offer_sent", // между оффером и наймом — не откатываем
}

/** Канонический sortOrder стадии (с учётом legacy-алиасов). null = неизвестна. */
function resolveStageOrder(slug: string | null | undefined): number | null {
  if (!slug) return null
  if (slug in PLATFORM_STAGES) return PLATFORM_STAGES[slug as StageSlug].sortOrder
  const alias = LEGACY_STAGE_ALIAS[slug]
  if (alias) return PLATFORM_STAGES[alias].sortOrder
  return null
}

/**
 * Двигать ли нашу стадию `current` к hh-целевой `target` ВХОДЯЩИМ сигналом.
 *
 * Инвариант (#23, инцидент 14.07): входящий синк никогда не откатывает
 * прогресс воронки — двигаем стадию ТОЛЬКО строго вперёд по каноническому
 * порядку lib/stages.ts. hh-папка (consider/phone_interview/assessment) часто
 * отражает лишь раннее состояние отклика, тогда как наш внутренний прогресс
 * (demo_opened → anketa_filled → … → decision → interview → offer_sent) hh-папкой
 * вообще не двигался. Раньше защищались лишь терминальные hired/started_work/
 * rejected (NON_REGRESSABLE), поэтому суточный крон массово сбрасывал
 * demo_opened→primary_contact (610 кандидатов Revoluterra) и плодил
 * critical-алерты hh_stage_mismatch.
 *
 * Отказ (target=rejected/discard) сюда НЕ попадает — он авторитетен и
 * обрабатывается отдельно (отклик реально закрыт на hh).
 */
export function shouldMoveForward(current: string, target: StageSlug): boolean {
  if (current === target) return false // идемпотентность (обрабатывается выше)
  const curOrder = resolveStageOrder(current)
  const tgtOrder = PLATFORM_STAGES[target].sortOrder
  // Порядок обеих стадий известен → двигаем ТОЛЬКО строго вперёд.
  if (curOrder !== null) return tgtOrder > curOrder
  // Порядок текущей стадии неизвестен (экзотический/legacy-side slug) —
  // fallback на прежнюю защиту: блокируем только терминальные.
  return !NON_REGRESSABLE.has(current)
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export interface InboundSyncResult {
  vacancyId: string
  candidatesChecked: number
  moved: number
  skippedNoNegotiation: number
  errors: number
  reason?: string // если вакансия пропущена целиком (no_token и т.п.)
}

// Резолвим negotiation id кандидата (тот же двухшаговый lookup, что и в
// channel-stage/route.ts и sync-stage.ts).
// Экспортировано (13.07): переиспользуется watchdog-сверкой
// lib/hiring-watchdog/hh-reconcile.ts — тот же поиск актуального negotiationId.
export async function resolveNegotiationId(candidateId: string, companyId: string): Promise<string | null> {
  const [direct] = await db
    .select({ hhResponseId: hhResponses.hhResponseId })
    .from(hhResponses)
    .where(and(eq(hhResponses.localCandidateId, candidateId), eq(hhResponses.companyId, companyId)))
    // Свежий negotiation при повторном отклике (см. sync-stage.ts, 11.07)
    .orderBy(desc(hhResponses.createdAt))
    .limit(1)
  if (direct?.hhResponseId) return direct.hhResponseId

  const [link] = await db
    .select({ hhApplicationId: hhCandidates.hhApplicationId })
    .from(hhCandidates)
    .where(eq(hhCandidates.candidateId, candidateId))
    .limit(1)
  if (!link?.hhApplicationId) return null

  const [resp] = await db
    .select({ hhResponseId: hhResponses.hhResponseId })
    .from(hhResponses)
    .where(and(eq(hhResponses.companyId, companyId), eq(hhResponses.hhResponseId, link.hhApplicationId)))
    .limit(1)
  return resp?.hhResponseId ?? null
}

// Живой запрос текущей hh-ПАПКИ (коллекции работодателя) negotiation.
// Возвращает employer_state.id либо null (403/404/сеть/таймаут — штатное
// «не получилось», синк не падает).
//
// ВАЖНО (fix 13.07): читаем `employer_state.id`, а НЕ `state.id`.
// GET /negotiations/{id} (деталь) отдаёт ДВА поля состояния:
//   - state.id          — ГРУБЫЙ lifecycle отклика (response/interview/…),
//                         обращённый к кандидату; НЕ совпадает с папкой HR.
//   - employer_state.id  — реальная папка/коллекция работодателя
//                         (phone_interview/consider/assessment/interview/
//                         discard_by_employer/hired) — то, что HR видит и
//                         настраивает, и под что спроектирован
//                         hhStateToPlatformStage (см. lib/hh/stage-mapping.ts).
// До фикса функция читала state.id → грубый статус не совпадал с папкой и
// (а) двигал candidates.stage мимо реальной hh-папки во входящем синке,
// (б) генерил ложные critical-алерты в lib/hiring-watchdog/hh-reconcile.ts.
// Список /negotiations/{collection} (import-responses) — другой случай: там
// item.state.id уже равен коллекции, поэтому тот путь трогать не нужно.
// Экспортировано (13.07): переиспользуется watchdog-сверкой (см. выше).
export async function fetchNegotiationState(accessToken: string, negotiationId: string): Promise<string | null> {
  try {
    const res = await fetch(`${HH_API_BASE}/negotiations/${negotiationId}`, {
      headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(HH_FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { employer_state?: { id?: string } }
    return data?.employer_state?.id ?? null
  } catch {
    return null
  }
}

/**
 * Синхронизировать входящие hh-стадии для одной вакансии.
 * Идемпотентно. Не бросает — ошибки считаются, но не роняют прогон.
 */
export async function syncInboundHhStages(vacancyId: string): Promise<InboundSyncResult> {
  const result: InboundSyncResult = {
    vacancyId,
    candidatesChecked: 0,
    moved: 0,
    skippedNoNegotiation: 0,
    errors: 0,
  }

  // Вакансия + компания.
  const [vac] = await db
    .select({ id: vacancies.id, companyId: vacancies.companyId, hhVacancyId: vacancies.hhVacancyId, deletedAt: vacancies.deletedAt })
    .from(vacancies)
    .where(eq(vacancies.id, vacancyId))
    .limit(1)

  if (!vac) return { ...result, reason: "vacancy_not_found" }
  if (vac.deletedAt) return { ...result, reason: "vacancy_deleted" }
  if (!vac.hhVacancyId) return { ...result, reason: "not_hh_linked" }

  // ГАРД: нет валидного токена → пропускаем без краша (стейджинг: токены off).
  const token = await getValidToken(vac.companyId).catch(() => null)
  if (!token) return { ...result, reason: "no_token" }

  // Кандидаты вакансии, привязанные к hh (source='hh' покрывает импорт).
  const rows = await db
    .select({ id: candidates.id, stage: candidates.stage })
    .from(candidates)
    .where(eq(candidates.vacancyId, vacancyId))

  for (const cand of rows) {
    result.candidatesChecked++
    try {
      const negId = await resolveNegotiationId(cand.id, vac.companyId)
      if (!negId) {
        result.skippedNoNegotiation++
        continue
      }

      const hhState = (await fetchNegotiationState(token.accessToken, negId)) as HhNegotiationState | null
      const target = hhStateToPlatformStage(hhState)

      // map=null → «оставить предыдущий» (fallback): hh-состояния нет у нас.
      if (!target) {
        await sleep(PER_CANDIDATE_DELAY_MS)
        continue
      }

      const current = cand.stage ?? "new"
      if (current === target) {
        await sleep(PER_CANDIDATE_DELAY_MS)
        continue // уже синхронно — идемпотентность
      }

      const isDiscard = target === "rejected"

      // Отказ (discard) всегда авторитетен — отклик реально закрыт на hh,
      // применяем даже если это «назад» (в т.ч. воскрешать rejected не-отказом
      // нельзя — см. ниже). Все прочие входящие сигналы двигают нашу стадию
      // ТОЛЬКО вперёд по каноническому порядку: hh-папка часто отражает лишь
      // раннее состояние, а внутренний прогресс (demo/anketa/test/interview)
      // hh-папкой не двигался. Раньше откатывались все не-терминальные стадии
      // (NON_REGRESSABLE защищал только hired/started_work/rejected) — суточный
      // крон массово сбрасывал demo_opened→primary_contact и плодил
      // critical-алерты (инцидент 14.07, вакансия Revoluterra: moved 610).
      if (!isDiscard && !shouldMoveForward(current, target)) {
        await sleep(PER_CANDIDATE_DELAY_MS)
        continue
      }

      // Формируем апдейт.
      const updateSet: Record<string, unknown> = {
        stage: target,
        updatedAt: new Date(),
      }
      if (isDiscard) {
        // Проставляем инициатора отказа + машинную причину для отчёта.
        // C-1: autoProcessingStopped обязателен здесь — иначе shouldStopFollowUp
        // (lib/followup/should-stop.ts) не видит причины остановиться (stage=
        // 'rejected' не входит в её ADVANCED_STAGES), и кандидат, который сам
        // отказался на hh (discard_by_applicant), продолжает получать дожимы
        // бесконечно. Ручной перевод в rejected (stage/route.ts) этот флаг уже
        // ставит — здесь (входящий hh-синк) он терялся.
        updateSet.autoProcessingStopped = true
        updateSet.autoProcessingStoppedAt = new Date()
        if (isCandidateInitiatedDiscard(hhState)) {
          updateSet.rejectionInitiator = "candidate"
          updateSet.autoProcessingStoppedReason = "hh_discard_by_applicant"
        } else {
          updateSet.rejectionInitiator = "company"
          updateSet.autoProcessingStoppedReason = "hh_discard_by_employer"
        }
      }

      await db.update(candidates).set(updateSet).where(eq(candidates.id, cand.id))
      result.moved++

      console.log(
        "[hh:inbound-sync]",
        JSON.stringify({
          candidateId: cand.id,
          vacancyId,
          from: current,
          to: target,
          hhState,
          initiator: isDiscard ? (updateSet.rejectionInitiator as string) : undefined,
        }),
      )
    } catch (err) {
      result.errors++
      console.warn(
        "[hh:inbound-sync] candidate error",
        cand.id,
        err instanceof Error ? err.message : String(err),
      )
    }
    await sleep(PER_CANDIDATE_DELAY_MS)
  }

  return result
}

/**
 * Синк входящих hh-стадий по всем активным hh-привязанным вакансиям.
 * Активные = не удалены, не в архиве hh, есть hhVacancyId. Вакансии без токена
 * (или где getValidToken=null) пропускаются штатно (reason=no_token).
 */
export async function syncInboundHhStagesAllActive(opts?: { limitVacancies?: number }): Promise<{
  vacanciesProcessed: number
  vacanciesSkipped: number
  candidatesChecked: number
  moved: number
  errors: number
  perVacancy: InboundSyncResult[]
}> {
  const active = await db
    .select({ id: vacancies.id })
    .from(vacancies)
    // hh_archived может быть NULL (вакансия ещё не синкалась hh-vacancy-sync) —
    // трактуем NULL как «не в архиве» (ne(true) исключает только явный true).
    .where(and(
      isNotNull(vacancies.hhVacancyId),
      isNull(vacancies.deletedAt),
      or(isNull(vacancies.hhArchived), ne(vacancies.hhArchived, true)),
    ))

  const list = typeof opts?.limitVacancies === "number" ? active.slice(0, opts.limitVacancies) : active

  const perVacancy: InboundSyncResult[] = []
  let vacanciesProcessed = 0
  let vacanciesSkipped = 0
  let candidatesChecked = 0
  let moved = 0
  let errors = 0

  for (const v of list) {
    const r = await syncInboundHhStages(v.id)
    perVacancy.push(r)
    if (r.reason) {
      vacanciesSkipped++
    } else {
      vacanciesProcessed++
    }
    candidatesChecked += r.candidatesChecked
    moved += r.moved
    errors += r.errors
  }

  return { vacanciesProcessed, vacanciesSkipped, candidatesChecked, moved, errors, perVacancy }
}
