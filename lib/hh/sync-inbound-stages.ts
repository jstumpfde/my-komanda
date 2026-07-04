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

import { and, eq, isNull, isNotNull, or, ne } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies, hhResponses, hhCandidates } from "@/lib/db/schema"
import { getValidToken } from "@/lib/hh-helpers"
import {
  hhStateToPlatformStage,
  isCandidateInitiatedDiscard,
  type HhNegotiationState,
} from "@/lib/hh/stage-mapping"

const HH_API_BASE = "https://api.hh.ru"
const USER_AGENT = "Company24/1.0 (company24.pro)"
const HH_FETCH_TIMEOUT_MS = 15_000
const PER_CANDIDATE_DELAY_MS = 200 // вежливо к rate-limit hh

// Стадии, которые НЕ откатываем входящим сигналом (кроме отказа).
const NON_REGRESSABLE = new Set(["hired", "started_work", "rejected"])

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
async function resolveNegotiationId(candidateId: string, companyId: string): Promise<string | null> {
  const [direct] = await db
    .select({ hhResponseId: hhResponses.hhResponseId })
    .from(hhResponses)
    .where(and(eq(hhResponses.localCandidateId, candidateId), eq(hhResponses.companyId, companyId)))
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

// Живой запрос текущего состояния negotiation. Возвращает state.id либо null
// (403/404/сеть/таймаут — штатное «не получилось», синк не падает).
async function fetchNegotiationState(accessToken: string, negotiationId: string): Promise<string | null> {
  try {
    const res = await fetch(`${HH_API_BASE}/negotiations/${negotiationId}`, {
      headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(HH_FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { state?: { id?: string } }
    return data?.state?.id ?? null
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

      // Не откатываем терминальные наши стадии входящим сигналом — КРОМЕ отказа
      // (hh-discard закрыл отклик, это авторитетно). Пример: у нас offer_sent,
      // а hh вернул assessment — не двигаем назад в тест.
      if (!isDiscard && NON_REGRESSABLE.has(current)) {
        await sleep(PER_CANDIDATE_DELAY_MS)
        continue
      }
      // Если мы уже rejected — не «воскрешаем» кандидата не-отказным сигналом.
      if (current === "rejected" && !isDiscard) {
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
