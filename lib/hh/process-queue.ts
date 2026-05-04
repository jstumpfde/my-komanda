// Извлечённая логика разбора hh-откликов: создаёт/находит кандидата,
// (опционально) запускает AI-скоринг, шлёт демо-ссылку через hh-API,
// ставит status=invited и расписывает follow-up. Используется и из ручного
// /api/integrations/hh/process-queue (POST по сессии), и из cron-эндпоинта
// /api/cron/hh-import (X-Cron-Secret + respectWorkingHours=true).

import { db } from "@/lib/db"
import { hhResponses, candidates, vacancies, followUpCampaigns, followUpMessages } from "@/lib/db/schema"
import type { VacancyAiProcessSettings } from "@/lib/db/schema"
import { and, eq, isNull } from "drizzle-orm"
import { getValidToken } from "@/lib/hh-helpers"
import { changeNegotiationState, getNegotiationMessages } from "@/lib/hh-api"
import { generateCandidateShortId } from "@/lib/short-id"
import { generateTouchSchedule } from "@/lib/followup/schedule"
import { DEFAULT_FOLLOWUP_MESSAGES } from "@/lib/followup/default-messages"
import { isFollowUpPreset } from "@/lib/followup/presets"
import { canSendNow } from "@/lib/schedule/can-send-now"

const DEMO_INVITE_MESSAGE = "Здравствуйте! Спасибо за отклик. Мы подготовили короткую демонстрацию должности — 15 минут, и вы узнаете всё о задачах, команде и доходе. Перейдите по ссылке: https://company24.pro/demo/invite"

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export interface ProcessQueueOptions {
  companyId:              string
  /** Если задано — обрабатываем только отклики этой локальной вакансии. */
  localVacancyId?:        string
  /** Лимит на количество откликов в одном вызове. */
  limit?:                 number
  /** Задержка между откликами (рейт-лимит к hh API). */
  delaySeconds?:          number
  /** Если true — отклики вакансий с canSendNow()=false откладываются. */
  respectWorkingHours?:   boolean
  /** Map (companyId → bool), на который смотрит ручной handler для DELETE-stop. */
  stopFlags?:             Map<string, boolean>
}

export interface ProcessQueueResult {
  processed:          number
  invited:            number
  rejected:           0
  kept:               0
  delaySeconds:       number
  deferredOffHours:   number
  results: Array<{
    id:      string
    name:    string | null
    action:  string
    error?:  string
  }>
  /** Если hh-токена нет — handler отдаёт 400 на это. */
  noToken?:           true
  /** Если задана локальная вакансия, но она не привязана к hh. */
  vacancyNotLinked?:  true
}

export async function processHhQueue(opts: ProcessQueueOptions): Promise<ProcessQueueResult> {
  const {
    companyId,
    localVacancyId,
    respectWorkingHours = false,
    stopFlags,
  } = opts

  const limit = Math.min(Math.max(Number(opts.limit) || 5, 1), 50)
  const reqDelaySeconds = opts.delaySeconds

  const tokenResult = await getValidToken(companyId)
  if (!tokenResult) {
    return emptyResult(reqDelaySeconds, { noToken: true })
  }

  let hhVacancyFilter: string | null = null
  let scopedAiSettings: VacancyAiProcessSettings = {}
  if (localVacancyId) {
    const [localVac] = await db
      .select({
        hhVacancyId:       vacancies.hhVacancyId,
        aiProcessSettings: vacancies.aiProcessSettings,
      })
      .from(vacancies)
      .where(and(eq(vacancies.id, localVacancyId), eq(vacancies.companyId, companyId)))
      .limit(1)
    if (!localVac?.hhVacancyId) {
      return emptyResult(reqDelaySeconds, { vacancyNotLinked: true })
    }
    hhVacancyFilter = localVac.hhVacancyId
    scopedAiSettings = (localVac.aiProcessSettings as VacancyAiProcessSettings | null) ?? {}
  }

  const effDelayMs = Math.max(0, (reqDelaySeconds ?? 30) * 1000)
  const effInviteMsg = scopedAiSettings.inviteMessage?.trim() || DEMO_INVITE_MESSAGE

  const newResponses = await db
    .select()
    .from(hhResponses)
    .where(
      hhVacancyFilter
        ? and(eq(hhResponses.companyId, companyId), eq(hhResponses.status, "response"), eq(hhResponses.hhVacancyId, hhVacancyFilter))
        : and(eq(hhResponses.companyId, companyId), eq(hhResponses.status, "response"))
    )
    .limit(limit)

  if (newResponses.length === 0) {
    return emptyResult(reqDelaySeconds)
  }

  const localVacancies = await db.select().from(vacancies)
    .where(and(eq(vacancies.companyId, companyId), isNull(vacancies.deletedAt)))

  if (stopFlags) stopFlags.set(companyId, false)

  // Карта остановленных кандидатов: skip auto-processing для них.
  const linkedCandidateIds = newResponses
    .map(r => r.localCandidateId)
    .filter((v): v is string => !!v)
  const stoppedCandidateIds = new Set<string>()
  if (linkedCandidateIds.length > 0) {
    const stoppedRows = await db
      .select({ id: candidates.id })
      .from(candidates)
      .where(eq(candidates.autoProcessingStopped, true))
    for (const row of stoppedRows) {
      if (linkedCandidateIds.includes(row.id)) stoppedCandidateIds.add(row.id)
    }
  }

  const results: ProcessQueueResult["results"] = []
  let invitedCount = 0
  let deferredOffHours = 0

  for (let idx = 0; idx < newResponses.length; idx++) {
    const resp = newResponses[idx]
    if (stopFlags?.get(companyId)) {
      results.push({ id: resp.hhResponseId, name: resp.candidateName, action: "stopped" })
      break
    }

    if (resp.localCandidateId && stoppedCandidateIds.has(resp.localCandidateId)) {
      results.push({ id: resp.hhResponseId, name: resp.candidateName, action: "auto_stopped" })
      continue
    }

    const localVac = localVacancies.find(v => v.hhVacancyId === resp.hhVacancyId) || null

    // Проверка расписания — для cron'а: если нерабочее время / выходной /
    // праздник — оставляем status='response', следующий cron подберёт.
    if (respectWorkingHours && localVac) {
      const check = canSendNow(localVac)
      if (!check.allowed) {
        deferredOffHours++
        results.push({
          id:     resp.hhResponseId,
          name:   resp.candidateName,
          action: `deferred_${check.reason ?? "off_hours"}`,
        })
        continue
      }
    }

    const raw = resp.rawData as {
      resume?: {
        id?: string
        area?: { name?: string }
        salary?: { amount?: number; currency?: string }
      }
    } | null
    const candidateCity = raw?.resume?.area?.name ?? undefined
    const candidateSalary = raw?.resume?.salary?.amount ?? null

    const targetStage = "demo"
    const baseMessage = effInviteMsg
    const hhAction = "invitation"
    const newStatus = "invited"

    try {
      let candidateToken: string | null = null
      let candidateId: string | null = resp.localCandidateId ?? null
      // Существующая запись (если найдена) — для защитного backfill
      // пустых полей (city/name/phone/email) при апдейте.
      let existingCand: { id: string; city: string | null; name: string; phone: string | null; email: string | null } | null = null

      if (!candidateId && localVac) {
        const cols = { id: candidates.id, city: candidates.city, name: candidates.name, phone: candidates.phone, email: candidates.email }
        if (resp.candidateEmail) {
          const [byEmail] = await db
            .select(cols)
            .from(candidates)
            .where(and(eq(candidates.vacancyId, localVac.id), eq(candidates.email, resp.candidateEmail)))
            .limit(1)
          if (byEmail) { candidateId = byEmail.id; existingCand = byEmail }
        }
        if (!candidateId && resp.candidatePhone) {
          const [byPhone] = await db
            .select(cols)
            .from(candidates)
            .where(and(eq(candidates.vacancyId, localVac.id), eq(candidates.phone, resp.candidatePhone)))
            .limit(1)
          if (byPhone) { candidateId = byPhone.id; existingCand = byPhone }
        }
        if (!candidateId && resp.candidateName) {
          const [byName] = await db
            .select(cols)
            .from(candidates)
            .where(and(eq(candidates.vacancyId, localVac.id), eq(candidates.name, resp.candidateName)))
            .limit(1)
          if (byName) { candidateId = byName.id; existingCand = byName }
        }
        if (candidateId) {
          await db.update(hhResponses)
            .set({ localCandidateId: candidateId })
            .where(eq(hhResponses.id, resp.id))
        }
      }
      // Если запись была привязана через resp.localCandidateId — подтянем
      // её сейчас, чтобы тоже применить защитный backfill.
      if (candidateId && !existingCand) {
        const [row] = await db
          .select({ id: candidates.id, city: candidates.city, name: candidates.name, phone: candidates.phone, email: candidates.email })
          .from(candidates)
          .where(eq(candidates.id, candidateId))
          .limit(1)
        if (row) existingCand = row
      }

      let newCandShortId: string | null = null

      if (!candidateId && localVac) {
        const newToken = Math.random().toString(36).slice(2) + Date.now().toString(36)
        candidateToken = newToken
        const newCand = await db.transaction(async (tx) => {
          const short = await generateCandidateShortId(tx, localVac.id)
          const [row] = await tx.insert(candidates).values({
            vacancyId:      localVac.id,
            name:           resp.candidateName || "Кандидат с hh.ru",
            phone:          resp.candidatePhone,
            email:          resp.candidateEmail,
            city:           candidateCity,
            source:         "hh",
            stage:          targetStage,
            salaryMin:      candidateSalary,
            salaryMax:      candidateSalary,
            token:          newToken,
            shortId:        short?.shortId ?? null,
            sequenceNumber: short?.sequenceNumber ?? null,
          }).returning()
          return row
        })
        if (newCand) {
          candidateId = newCand.id
          newCandShortId = newCand.shortId ?? null
        }
      } else if (candidateId) {
        // Защитный backfill: заполняем только пустые поля, заполненные не трогаем.
        const isEmpty = (s: string | null | undefined) => !s || s.trim() === ""
        const setFields: Record<string, unknown> = {
          stage: targetStage,
          updatedAt: new Date(),
        }
        if (existingCand) {
          if (isEmpty(existingCand.city) && candidateCity) setFields.city = candidateCity
          if (isEmpty(existingCand.email) && resp.candidateEmail) setFields.email = resp.candidateEmail
          if (isEmpty(existingCand.phone) && resp.candidatePhone) setFields.phone = resp.candidatePhone
          // Имя «Кандидат с hh.ru» — это исторический placeholder, тоже считаем пустым
          const namePlaceholder = existingCand.name === "Кандидат с hh.ru"
          if ((isEmpty(existingCand.name) || namePlaceholder) && resp.candidateName) {
            setFields.name = resp.candidateName
          }
        }
        await db.update(candidates).set(setFields).where(eq(candidates.id, candidateId))
      }

      // AI-скоринг при импорте hh-откликов отключён — оценка теперь
      // запускается только при завершении демо (см.
      // app/api/public/demo/[token]/answer/route.ts), чтобы не тратить
      // токены на кандидатов, которые до демо не дошли.

      // Проверяем — отправляли ли работодателю уже что-то по этому отклику.
      let previouslyInvited = false
      try {
        const msgs = await getNegotiationMessages(tokenResult.accessToken, resp.hhResponseId)
        previouslyInvited = msgs.some(m => m?.author?.participant_type === "employer")
      } catch (msgErr) {
        console.warn("[PQ] getNegotiationMessages failed — fallback to inviteMessage:",
          msgErr instanceof Error ? msgErr.message : msgErr)
      }

      // Формируем итоговое сообщение.
      let finalMessage: string | null = baseMessage
      if (localVac && (candidateToken || candidateId)) {
        const nameParts = (resp.candidateName || "").trim().split(/\s+/)
        const candidateName = nameParts[1] || nameParts[0] || "Здравствуйте"
        let shortIdForUrl: string | null = newCandShortId
        if (!shortIdForUrl && candidateId) {
          const [existing] = await db
            .select({ shortId: candidates.shortId })
            .from(candidates)
            .where(eq(candidates.id, candidateId))
            .limit(1)
          shortIdForUrl = existing?.shortId ?? null
          if (!shortIdForUrl) {
            const newShort = await db.transaction(async (tx) => {
              return await generateCandidateShortId(tx, localVac.id)
            })
            if (newShort?.shortId) {
              await db.update(candidates)
                .set({
                  shortId:        newShort.shortId,
                  sequenceNumber: newShort.sequenceNumber,
                })
                .where(eq(candidates.id, candidateId))
              shortIdForUrl = newShort.shortId
            }
          }
        }
        const tokenForUrl = shortIdForUrl ?? candidateId
        const demoUrl = `https://company24.pro/demo/${tokenForUrl}`

        const messageText = previouslyInvited
          ? (scopedAiSettings.reInviteMessage?.trim() || scopedAiSettings.inviteMessage?.trim() || DEMO_INVITE_MESSAGE)
          : (scopedAiSettings.inviteMessage?.trim() || DEMO_INVITE_MESSAGE)

        const replaced = messageText
          .replaceAll("[Имя]", candidateName)
          .replaceAll("[имя]", candidateName)
          .replaceAll("{имя}", candidateName)
          .replaceAll("{Имя}", candidateName)
          .replaceAll("[должность]", localVac.title || "")
          .replaceAll("{должность}", localVac.title || "")
          .replaceAll("[компания]", "Company24")
          .replaceAll("{компания}", "Company24")
          .replaceAll("[ссылка]", demoUrl)
          .replaceAll("{ссылка}", demoUrl)

        finalMessage = replaced.includes(demoUrl) ? replaced : replaced + "\n\n" + demoUrl
      }

      if (hhAction && finalMessage) {
        const rawResume = raw?.resume?.id
        try {
          await changeNegotiationState(
            tokenResult.accessToken,
            resp.hhResponseId,
            hhAction,
            finalMessage,
            resp.hhVacancyId,
            rawResume,
          )
        } catch (hhErr) {
          const msg = hhErr instanceof Error ? hhErr.message : String(hhErr)
          if (msg.includes("already_applied")) {
            console.log("[PQ] already_applied — продолжаем", resp.candidateName)
          } else {
            console.error("[PQ] hh changeState failed:", msg)
          }
        }
      }

      const updatePayload: { status: string; localCandidateId?: string } = { status: newStatus }
      if (candidateId) updatePayload.localCandidateId = candidateId
      await db.update(hhResponses).set(updatePayload).where(eq(hhResponses.id, resp.id))

      // Старт воронки дожима.
      if (candidateId && localVac) {
        try {
          const [campaign] = await db
            .select()
            .from(followUpCampaigns)
            .where(and(
              eq(followUpCampaigns.vacancyId, localVac.id),
              eq(followUpCampaigns.enabled, true),
            ))
            .limit(1)
          if (campaign && isFollowUpPreset(campaign.preset) && campaign.preset !== "off") {
            const messages = (campaign.customMessages && campaign.customMessages.length > 0)
              ? campaign.customMessages
              : DEFAULT_FOLLOWUP_MESSAGES
            const touches = generateTouchSchedule(
              campaign.id, candidateId, campaign.preset, new Date(), messages,
            )
            if (touches.length > 0) {
              await db.insert(followUpMessages).values(touches)
            }
          }
        } catch (followUpErr) {
          console.error("[PQ] schedule follow-up failed:",
            followUpErr instanceof Error ? followUpErr.message : followUpErr)
        }
      }

      invitedCount++
      results.push({ id: resp.hhResponseId, name: resp.candidateName, action: "invited" })
    } catch (err: unknown) {
      console.error("[PQ] FAIL", resp.candidateName, err instanceof Error ? err.message : err)
      results.push({
        id:    resp.hhResponseId,
        name:  resp.candidateName,
        action: "failed",
        error: err instanceof Error ? err.message : String(err),
      })
    }

    if (idx < newResponses.length - 1) await sleep(effDelayMs)
  }

  if (stopFlags) stopFlags.delete(companyId)

  return {
    processed:        results.length,
    invited:          invitedCount,
    rejected:         0,
    kept:             0,
    delaySeconds:     Math.round(effDelayMs / 1000),
    deferredOffHours,
    results,
  }
}

function emptyResult(
  reqDelaySeconds: number | undefined,
  flags: Partial<Pick<ProcessQueueResult, "noToken" | "vacancyNotLinked">> = {},
): ProcessQueueResult {
  const delaySeconds = reqDelaySeconds ?? 30
  return {
    processed:        0,
    invited:          0,
    rejected:         0,
    kept:             0,
    delaySeconds,
    deferredOffHours: 0,
    results:          [],
    ...flags,
  }
}
