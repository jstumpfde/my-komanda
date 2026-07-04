// Синхронизация изменений стейджа кандидата с hh.ru.
//
// При смене stage в локальной CRM (через handler /candidates/[id]/stage
// или bulk endpoint) отправляем соответствующее действие в hh:
//   - rejected         → /negotiations/discard_by_employer  (action="discard")
//   - primary_contact  → /negotiations/phone_interview      (action="invitation")
//
// Не блокирует основной flow: ошибка hh-API логируется, но локальный стейдж
// остаётся изменённым. На bulk-операциях вызывающий слой должен пройти
// последовательно с задержкой (anti-429) — см. bulk/route.ts.

import { db } from "@/lib/db"
import { candidates, hhCandidates, hhResponses, vacancies, companies } from "@/lib/db/schema"
import type { VacancyAiProcessSettings } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { getCandidateFirstName } from "@/lib/messaging/candidate-name"
import { getValidToken } from "@/lib/hh-helpers"
import { changeNegotiationState } from "@/lib/hh-api"
import { getStageHhAction, parsePipeline, type StageSlug } from "@/lib/stages"
import { getEffectiveMessageDefaults } from "@/lib/messaging/effective-message-defaults"
import { renderTemplate } from "@/lib/template-renderer"
import { rejectMessageVars } from "@/lib/funnel-v2/reject-vars"
import { getAppBaseUrl } from "@/lib/funnel-v2/base-url"

interface CandidateContext {
  id:        string
  name:      string
  vacancyId: string
  shortId:   string | null
  token:     string | null
}

async function loadContext(candidateId: string): Promise<{
  cand: CandidateContext
  vac:  { title: string; companyId: string; companyName: string; aiProcessSettings: VacancyAiProcessSettings; descriptionJson: unknown }
  hh:   { hhResponseId: string }
} | null> {
  // Шаг 1: основной запрос — кандидат, вакансия и попытка резолва
  // hh_responses через прямую связку local_candidate_id (новый импорт).
  // Дополнительно тянем hh_candidates.hh_application_id — для legacy
  // hh-кандидатов (старый импорт через lib/hh/client) это единственный
  // путь к hh_responses. На проде ~100% hh-кандидатов идут через legacy
  // путь, без fallback sync молча промахивается.
  const [row] = await db
    .select({
      candId:           candidates.id,
      candName:         candidates.name,
      candShortId:      candidates.shortId,
      candToken:        candidates.token,
      vacancyId:        candidates.vacancyId,
      vacTitle:         vacancies.title,
      vacCompanyId:     vacancies.companyId,
      vacAiSettings:    vacancies.aiProcessSettings,
      vacDescriptionJson: vacancies.descriptionJson,
      companyName:      companies.name,
      hhResponseId:     hhResponses.hhResponseId,
      hhApplicationId:  hhCandidates.hhApplicationId,
    })
    .from(candidates)
    .innerJoin(vacancies, eq(vacancies.id, candidates.vacancyId))
    .leftJoin(companies, eq(companies.id, vacancies.companyId))
    .leftJoin(hhResponses, and(
      eq(hhResponses.localCandidateId, candidates.id),
      eq(hhResponses.companyId,        vacancies.companyId),
    ))
    .leftJoin(hhCandidates, eq(hhCandidates.candidateId, candidates.id))
    .where(eq(candidates.id, candidateId))
    .limit(1)

  if (!row) return null

  // Шаг 2: если прямой связки нет, но есть hh_application_id — резолвим
  // через него (тот же fallback, что в /api/modules/hr/candidates/[id]/route).
  let hhResponseId = row.hhResponseId
  if (!hhResponseId && row.hhApplicationId) {
    const [resp] = await db
      .select({ hhResponseId: hhResponses.hhResponseId })
      .from(hhResponses)
      .where(and(
        eq(hhResponses.companyId,     row.vacCompanyId),
        eq(hhResponses.hhResponseId,  row.hhApplicationId),
      ))
      .limit(1)
    hhResponseId = resp?.hhResponseId ?? null
  }

  if (!hhResponseId) return null

  return {
    cand: {
      id:        row.candId,
      name:      row.candName,
      vacancyId: row.vacancyId,
      shortId:   row.candShortId,
      token:     row.candToken,
    },
    vac: {
      title:             row.vacTitle ?? "",
      companyId:         row.vacCompanyId,
      companyName:       row.companyName ?? "",
      aiProcessSettings: (row.vacAiSettings as VacancyAiProcessSettings | null) ?? {},
      descriptionJson:   row.vacDescriptionJson,
    },
    hh: { hhResponseId },
  }
}

/**
 * Отправляет в hh «отказ» (discard_by_employer) с шаблоном из
 * vacancies.ai_process_settings.rejectMessage. Вернёт false если
 * кандидат не привязан к hh-отклику или нет валидного токена —
 * это нормальные ситуации, не ошибки.
 */
export async function trySyncRejectToHh(candidateId: string, customMessage?: string | null): Promise<boolean> {
  try {
    const ctx = await loadContext(candidateId)
    if (!ctx) return false

    const token = await getValidToken(ctx.vac.companyId)
    if (!token) return false

    // customMessage — текст отказа из вызывающего кода (факторные тексты
    // стоп-факторов или «мягкое письмо» Портрета). Всегда прогоняем через
    // renderTemplate: подстановка {{имя}}/{{вакансия}} идемпотентна (один
    // проход, подставленное не перепарсивается), поэтому уже отрендеренные
    // стоп-факторные тексты не страдают, а сырой rejectLetter Портрета
    // корректно получает имя кандидата.
    const { firstName } = await getCandidateFirstName(ctx.cand.id)
    // Единый набор переменных отказа (reject-vars, гвард №4 п.1): + company и
    // demo_link — через этот путь уходят и v2-тексты стадий (pending-rejections
    // → executeRejection), и стоп-факторные/Портрет-письма. Инвариант:
    // кандидату не уходит литерал {{...}}. renderTemplate идемпотентен —
    // уже отрендеренные тексты не страдают.
    const rejectVars = rejectMessageVars({
      firstName,
      vacancyTitle: ctx.vac.title,
      companyName:  ctx.vac.companyName,
      token:        ctx.cand.token,
      baseUrl:      getAppBaseUrl(),
    })
    let message: string
    if (typeof customMessage === "string" && customMessage.trim().length > 0) {
      message = renderTemplate(customMessage, rejectVars)
    } else {
      const tpl = ctx.vac.aiProcessSettings.rejectMessage?.trim() || (await getEffectiveMessageDefaults(ctx.vac.companyId)).rejectMessage
      message = renderTemplate(tpl, rejectVars)
    }

    await changeNegotiationState(token.accessToken, ctx.hh.hhResponseId, "discard", message)
    console.info(`[hh:sync-stage] reject → ${ctx.hh.hhResponseId} (cand ${ctx.cand.id})`)
    return true
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[hh:sync-stage] reject failed for cand ${candidateId}: ${msg}`)
    return false
  }
}

/**
 * Отправляет в hh «приглашение» (phone_interview) с шаблоном из
 * vacancies.ai_process_settings.inviteMessage и demo-ссылкой.
 * Вернёт false если кандидат не привязан к hh-отклику или нет токена.
 */
export async function trySyncInviteToHh(candidateId: string): Promise<boolean> {
  try {
    const ctx = await loadContext(candidateId)
    if (!ctx) return false

    const token = await getValidToken(ctx.vac.companyId)
    if (!token) return false

    const demoToken = ctx.cand.shortId ?? ctx.cand.id
    const demoLink  = `https://company24.pro/demo/${demoToken}`

    const { firstName } = await getCandidateFirstName(ctx.cand.id)
    const tpl = ctx.vac.aiProcessSettings.inviteMessage?.trim() || (await getEffectiveMessageDefaults(ctx.vac.companyId)).inviteMessage
    let message = renderTemplate(tpl, {
      name:      firstName,
      vacancy:   ctx.vac.title,
      company:   ctx.vac.companyName,   // инвариант: {{company}} не уходит литералом
      demo_link: demoLink,
    })
    // Если шаблон не содержит ссылки — добавим её в конец, иначе hh
    // получит сообщение без CTA (поведение совпадает с process-queue).
    if (!message.includes(demoLink)) message = `${message}\n\n${demoLink}`

    await changeNegotiationState(token.accessToken, ctx.hh.hhResponseId, "invitation", message)
    console.info(`[hh:sync-stage] invite → ${ctx.hh.hhResponseId} (cand ${ctx.cand.id})`)
    return true
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[hh:sync-stage] invite failed for cand ${candidateId}: ${msg}`)
    return false
  }
}

/**
 * Переводит отклик кандидата на hh в стадию «Тестовое задание» (коллекция
 * hh `assessment`). Без сообщения в чат — текст с тест-ссылкой уходит
 * отдельным сообщением (test-invite). Вызывается при отправке теста.
 * Вернёт false, если кандидат не привязан к hh-отклику или нет токена.
 */
export async function trySyncTestStageToHh(candidateId: string): Promise<boolean> {
  try {
    const ctx = await loadContext(candidateId)
    if (!ctx) return false
    const token = await getValidToken(ctx.vac.companyId)
    if (!token) return false
    await changeNegotiationState(token.accessToken, ctx.hh.hhResponseId, "assessment")
    console.info(`[hh:sync-stage] assessment (тест) → ${ctx.hh.hhResponseId} (cand ${ctx.cand.id})`)
    return true
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[hh:sync-stage] assessment failed for cand ${candidateId}: ${msg}`)
    return false
  }
}

/**
 * Универсальная синхронизация: читает hh-action из настроек воронки вакансии
 * (vacancies.description_json.pipeline) для конкретной стадии и отправляет
 * соответствующее действие в hh (Ф6 рефакторинга 2026-05-10).
 *
 * Логика:
 *   getStageHhAction(stage, pipeline) === "discard"    → отказ с rejectMessage
 *   getStageHhAction(stage, pipeline) === "invitation" → приглашение с inviteMessage
 *   null                                                → ничего не делать
 *
 * Это позволяет HR настроить произвольный hh-маппинг (например, «На стадию
 * reference_check отправлять приглашение») в табе «Воронка».
 *
 * НЕ заменяет старые trySyncRejectToHh / trySyncInviteToHh — они остаются
 * для обратной совместимости и для дефолтного поведения, если pipeline пуст.
 */
export async function trySyncStageToHh(candidateId: string, newStage: string): Promise<boolean> {
  try {
    const ctx = await loadContext(candidateId)
    if (!ctx) return false

    // Company-level дефолты hh-маппинга (для вакансий без кастомной воронки).
    const [companyRow] = await db
      .select({ hiringDefaults: companies.hiringDefaultsJson })
      .from(companies)
      .where(eq(companies.id, ctx.vac.companyId))
      .limit(1)
    const companyHhActions = (companyRow?.hiringDefaults as { stageHhActions?: Record<string, "invitation" | "discard" | "assessment" | "hired" | null> } | null)?.stageHhActions

    const pipeline = parsePipeline(
      (ctx.vac.descriptionJson as Record<string, unknown> | null)?.pipeline,
      companyHhActions,
    )
    const action = getStageHhAction(newStage as StageSlug, pipeline)
    if (!action) return false

    const token = await getValidToken(ctx.vac.companyId)
    if (!token) return false

    const { firstName } = await getCandidateFirstName(ctx.cand.id)

    if (action === "discard") {
      const tpl = ctx.vac.aiProcessSettings.rejectMessage?.trim() || (await getEffectiveMessageDefaults(ctx.vac.companyId)).rejectMessage
      // Единый набор переменных отказа (инвариант: без литералов {{...}})
      const message = renderTemplate(tpl, rejectMessageVars({
        firstName,
        vacancyTitle: ctx.vac.title,
        companyName:  ctx.vac.companyName,
        token:        ctx.cand.token,
        baseUrl:      getAppBaseUrl(),
      }))
      await changeNegotiationState(token.accessToken, ctx.hh.hhResponseId, "discard", message)
      console.info(`[hh:sync-stage] discard (${newStage}) → ${ctx.hh.hhResponseId} (cand ${ctx.cand.id})`)
      return true
    }

    if (action === "assessment") {
      await changeNegotiationState(token.accessToken, ctx.hh.hhResponseId, "assessment")
      console.info(`[hh:sync-stage] assessment (${newStage}) → ${ctx.hh.hhResponseId} (cand ${ctx.cand.id})`)
      return true
    }

    // hired: без сообщения (текст «поздравляем» уходит отдельно, если настроен) —
    // просто двигаем hh-папку в "Выход на работу" (05.07, см. stage-mapping.ts).
    if (action === "hired") {
      await changeNegotiationState(token.accessToken, ctx.hh.hhResponseId, "hired")
      console.info(`[hh:sync-stage] hired (${newStage}) → ${ctx.hh.hhResponseId} (cand ${ctx.cand.id})`)
      return true
    }

    // invitation
    const demoToken = ctx.cand.shortId ?? ctx.cand.id
    const demoLink  = `https://company24.pro/demo/${demoToken}`
    const tpl = ctx.vac.aiProcessSettings.inviteMessage?.trim() || (await getEffectiveMessageDefaults(ctx.vac.companyId)).inviteMessage
    let message = renderTemplate(tpl, {
      name:      firstName,
      vacancy:   ctx.vac.title,
      company:   ctx.vac.companyName,   // инвариант: {{company}} не уходит литералом
      demo_link: demoLink,
    })
    if (!message.includes(demoLink)) message = `${message}\n\n${demoLink}`
    await changeNegotiationState(token.accessToken, ctx.hh.hhResponseId, "invitation", message)
    console.info(`[hh:sync-stage] invitation (${newStage}) → ${ctx.hh.hhResponseId} (cand ${ctx.cand.id})`)
    return true
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[hh:sync-stage] stage-sync failed for cand ${candidateId} stage=${newStage}: ${msg}`)
    return false
  }
}
