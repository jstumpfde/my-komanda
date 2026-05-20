// Извлечённая логика разбора hh-откликов: создаёт/находит кандидата,
// (опционально) запускает AI-скоринг, шлёт демо-ссылку через hh-API,
// ставит status=invited и расписывает follow-up. Используется и из ручного
// /api/integrations/hh/process-queue (POST по сессии), и из cron-эндпоинта
// /api/cron/hh-import (X-Cron-Secret + respectWorkingHours=true).

import { db } from "@/lib/db"
import { hhResponses, candidates, vacancies, followUpCampaigns, followUpMessages, hhCandidates } from "@/lib/db/schema"
import type { VacancyAiProcessSettings } from "@/lib/db/schema"
import { and, asc, eq, isNull } from "drizzle-orm"
import { getValidToken } from "@/lib/hh-helpers"
import { changeNegotiationState, getNegotiationMessages } from "@/lib/hh-api"
import { generateCandidateShortId } from "@/lib/short-id"
import { extractHhResumeFields, toCandidateColumns } from "@/lib/hh/extract-resume-fields"
import { saveCandidatePhoto } from "@/lib/hh/save-candidate-photo"
import { generateTouchSchedule, mergeMessagesWithDefaults } from "@/lib/followup/schedule"
import { DEFAULT_FOLLOWUP_NOT_OPENED } from "@/lib/followup/default-messages"
import { isFollowUpPreset } from "@/lib/followup/presets"
import { canSendNow } from "@/lib/schedule/can-send-now"
import { screenResume } from "@/lib/ai-screen-resume"
import { trySyncRejectToHh } from "@/lib/hh/sync-stage"

const DEMO_INVITE_MESSAGE = "Здравствуйте! Спасибо за отклик. Мы подготовили короткую демонстрацию должности — 15 минут, и вы узнаете всё о задачах, команде и доходе."

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
    .orderBy(asc(hhResponses.createdAt))
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
      resume?: Record<string, unknown>
    } | null
    // Расширенные поля резюме (birth_date, experience, education, skills, ...).
    // Если резюме приватное (403) или удалено — extracted будет {} и колонки не пишутся.
    const extracted = extractHhResumeFields(raw?.resume)
    const resumeIdForLog = (raw?.resume?.["id"] as string | undefined) ?? resp.hhResponseId
    if (raw?.resume && !extracted.birthDate) {
      console.warn(`[PQ] resume ${resumeIdForLog}: birth_date/age отсутствуют — кандидат без даты рождения`)
    }
    const extractedCols = toCandidateColumns(extracted)
    const candidateCity = (extracted.city as string | undefined) ?? undefined
    const candidateSalary = (extracted.salaryMin as number | undefined) ?? null

    // После отправки приглашения через hh API кандидат сразу попадает в
    // 'primary_contact' (приглашение отправлено, но не открыто). Переход
    // в 'demo_opened' произойдёт в /api/public/demo/[token]/visit когда
    // владелец первый раз откроет страницу.
    const targetStage = "primary_contact"
    const baseMessage = effInviteMsg
    const hhAction = "invitation"
    const newStatus = "invited"

    // Per-vacancy AI settings — нужны для minScore-фильтра и сообщений
    // отказа. scopedAiSettings заполняется только когда передан localVacancyId
    // (ручной запуск), для cron'а используем настройки конкретной вакансии.
    const aiSettings: VacancyAiProcessSettings =
      (localVac?.aiProcessSettings as VacancyAiProcessSettings | null) ?? scopedAiSettings

    // Если AI-скоринг резюме дал score ниже порога — отклоняем кандидата
    // (reject) или оставляем в "new" для ручного разбора (keep_new),
    // НЕ отправляя приглашение и НЕ запуская дожим.
    let belowThreshold: { score: number; threshold: number; action: "reject" | "keep_new" } | null = null

    try {
      let candidateToken: string | null = null
      let candidateId: string | null = resp.localCandidateId ?? null
      // Существующая запись (если найдена) — для защитного backfill
      // пустых полей (city/name/phone/email) при апдейте.
      let existingCand: { id: string; city: string | null; name: string; phone: string | null; email: string | null } | null = null

      // ── НОВОЕ: dedup по hh_resume_id ──────────────────────────────────
      // client.ts при импорте создаёт связку (candidate ↔ hh_resume_id) в
      // таблице hh_candidates. Если этот же resume.id приходит в hh_response,
      // ищем существующего кандидата ДО фоллбэка на email/phone/name. Без
      // этой проверки приватное hh-резюме (name='Кандидат с hh.ru',
      // email/phone NULL) не находилось и process-queue создавал второй
      // candidate-row → классический "дубль" anketa_filled/new.
      const resumeIdFromRaw = (raw?.resume?.["id"] as string | undefined) ?? null
      if (!candidateId && localVac && resumeIdFromRaw) {
        const [byResume] = await db
          .select({
            id: candidates.id,
            city: candidates.city,
            name: candidates.name,
            phone: candidates.phone,
            email: candidates.email,
          })
          .from(hhCandidates)
          .innerJoin(candidates, eq(candidates.id, hhCandidates.candidateId))
          .where(and(
            eq(hhCandidates.hhResumeId, resumeIdFromRaw),
            eq(candidates.vacancyId, localVac.id),
          ))
          .limit(1)
        if (byResume) {
          candidateId = byResume.id
          existingCand = byResume
          // Зафиксируем привязку в hh_responses — следующий проход найдёт
          // кандидата напрямую через resp.localCandidateId, не делая JOIN.
          await db.update(hhResponses)
            .set({ localCandidateId: candidateId })
            .where(eq(hhResponses.id, resp.id))
        }
      }
      // ── /НОВОЕ ─────────────────────────────────────────────────────────

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
            // Расширенные поля из hh-резюме (birth_date, education, key_skills, ...)
            // Записываются только те, для которых в extracted есть осмысленное значение.
            ...extractedCols,
          }).returning()
          return row
        })
        if (newCand) {
          candidateId = newCand.id
          newCandShortId = newCand.shortId ?? null
          // Качаем hh-фото локально, чтобы фронт не упирался в 403 от img.hhcdn.ru
          // (CDN режет браузерные Origin/Referer). На сервере подпись валидна.
          if (typeof extractedCols.photoUrl === "string" && /^https?:\/\//.test(extractedCols.photoUrl)) {
            const local = await saveCandidatePhoto(newCand.id, extractedCols.photoUrl)
            if (local && local !== extractedCols.photoUrl) {
              await db.update(candidates).set({ photoUrl: local }).where(eq(candidates.id, newCand.id))
            }
          }
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

        // Дополнительный backfill из hh-резюме: birth_date, experience, education,
        // skills и т.д. — только если у кандидата ещё нет anketa_answers (значит,
        // он сам не заполнял анкету и его hh-данные актуальнее) и поле пустое.
        try {
          const [exFull] = await db.select({
            anketaAnswers:      candidates.anketaAnswers,
            birthDate:          candidates.birthDate,
            experienceYears:    candidates.experienceYears,
            educationLevel:     candidates.educationLevel,
            workFormat:         candidates.workFormat,
            keySkills:          candidates.keySkills,
            skills:             candidates.skills,
            languages:          candidates.languages,
            relocationReady:    candidates.relocationReady,
            businessTripsReady: candidates.businessTripsReady,
            salaryMin:          candidates.salaryMin,
            salaryMax:          candidates.salaryMax,
            photoUrl:           candidates.photoUrl,
          }).from(candidates).where(eq(candidates.id, candidateId)).limit(1)

          if (exFull && exFull.anketaAnswers === null) {
            for (const [k, v] of Object.entries(extractedCols)) {
              const cur = (exFull as Record<string, unknown>)[k]
              const curEmpty =
                cur === null || cur === undefined ||
                (Array.isArray(cur) && cur.length === 0) ||
                (typeof cur === "string" && cur.trim() === "")
              if (curEmpty) setFields[k] = v
            }
          }
        } catch (err) {
          console.warn("[PQ] hh-resume backfill failed", err instanceof Error ? err.message : err)
        }

        // Если backfill попытался выставить hh-URL фото — сначала скачиваем
        // локально, иначе сохранили бы битую для браузера ссылку (403).
        if (typeof setFields.photoUrl === "string" && /^https?:\/\//.test(setFields.photoUrl)) {
          const local = await saveCandidatePhoto(candidateId, setFields.photoUrl)
          if (local) setFields.photoUrl = local
          else delete setFields.photoUrl
        }

        await db.update(candidates).set(setFields).where(eq(candidates.id, candidateId))
      }

      // AI-скоринг резюме (resume_score) — выставляется ОДИН РАЗ при первом
      // приёме отклика. Если кандидат уже оценён ранее (resume_score IS NOT
      // NULL) — пропускаем, чтобы не тратить токены повторно. Полный AI-скор
      // (aiScore) считается отдельно после завершения демо.
      if (candidateId && localVac) {
        try {
          const [scoreRow] = await db
            .select({ resumeScore: candidates.resumeScore })
            .from(candidates)
            .where(eq(candidates.id, candidateId))
            .limit(1)
          if (scoreRow && scoreRow.resumeScore == null) {
            const descJson = localVac.descriptionJson as Record<string, unknown> | null
            const anketa = (descJson?.anketa as Record<string, unknown> | undefined) ?? {}
            const result = await screenResume({
              resume: {
                name:            resp.candidateName,
                city:            candidateCity ?? null,
                salaryMin:       candidateSalary,
                experienceYears: (extracted.experienceYears as number | undefined) ?? null,
                keySkills:       (extracted.keySkills as string[] | undefined) ?? null,
                skills:          (extracted.skills as string[] | undefined) ?? null,
                educationLevel:  (extracted.educationLevel as string | undefined) ?? null,
                workFormat:      (extracted.workFormat as string | undefined) ?? null,
              },
              vacancy: {
                title:                localVac.title,
                city:                 localVac.city,
                aiIdealProfile:       (anketa.aiIdealProfile as string | undefined) ?? null,
                aiRequiredHardSkills: (anketa.aiRequiredHardSkills as string[] | undefined) ?? null,
                aiStopFactors:        (anketa.aiStopFactors as string[] | undefined) ?? null,
              },
            })
            if (result) {
              await db.update(candidates)
                .set({ resumeScore: result.score })
                .where(eq(candidates.id, candidateId))

              // minScore-фильтр: если порог настроен и score ниже —
              // помечаем кандидата как «ниже порога»; дальнейшая отправка
              // приглашения и шедул дожима будут пропущены, а развилка
              // reject/keep_new обработается ниже в одном месте.
              const minScore = typeof aiSettings.minScore === "number" ? aiSettings.minScore : 0
              if (minScore > 0 && result.score < minScore) {
                const action: "reject" | "keep_new" =
                  aiSettings.belowThresholdAction === "keep_new" ? "keep_new" : "reject"
                belowThreshold = { score: result.score, threshold: minScore, action }
              }
            }
          }
        } catch (err) {
          console.warn("[PQ] resume screening failed:", err instanceof Error ? err.message : err)
        }
      }

      // Если кандидат не прошёл minScore — выполняем разветвление и
      // выходим из обработки этого отклика. Приглашение и шедул дожима
      // ниже под `if (!belowThreshold)` пропустятся.
      if (belowThreshold && candidateId && localVac) {
        try {
          const [prev] = await db
            .select({ stage: candidates.stage, stageHistory: candidates.stageHistory })
            .from(candidates)
            .where(eq(candidates.id, candidateId))
            .limit(1)
          const fromStage = prev?.stage ?? "new"
          const history = (prev?.stageHistory as Array<Record<string, unknown>> | null) ?? []
          const nowIso = new Date().toISOString()
          const nowTs  = new Date()

          if (belowThreshold.action === "reject") {
            await db.update(candidates)
              .set({
                stage:                        "rejected",
                autoProcessingStopped:        true,
                autoProcessingStoppedReason:  "ai_min_score_below_threshold",
                autoProcessingStoppedAt:      nowTs,
                stageHistory: [...history, {
                  from:      fromStage,
                  to:        "rejected",
                  at:        nowIso,
                  reason:    "ai_min_score_below_threshold",
                  score:     belowThreshold.score,
                  threshold: belowThreshold.threshold,
                }],
                updatedAt: nowTs,
              })
              .where(eq(candidates.id, candidateId))

            // Сообщение мягкого отказа через hh (discard_by_employer)
            // с подстановкой имени/вакансии — переиспользуем sync-stage.
            await trySyncRejectToHh(candidateId)
          } else {
            // keep_new: оставляем stage="new", но ставим автостоп —
            // кандидат не попадёт в дальнейшую авто-обработку, ждёт ручного разбора.
            await db.update(candidates)
              .set({
                autoProcessingStopped:        true,
                autoProcessingStoppedReason:  "below_threshold_manual_review",
                autoProcessingStoppedAt:      nowTs,
                stageHistory: [...history, {
                  from:      fromStage,
                  to:        fromStage,
                  at:        nowIso,
                  reason:    "below_threshold_manual_review",
                  score:     belowThreshold.score,
                  threshold: belowThreshold.threshold,
                }],
                updatedAt: nowTs,
              })
              .where(eq(candidates.id, candidateId))
          }

          // hh_responses.status='invited' — отклик уходит из очереди разбора,
          // повторно не подбирается. Решение по кандидату принято.
          await db.update(hhResponses)
            .set({ status: "invited", localCandidateId: candidateId })
            .where(eq(hhResponses.id, resp.id))

          console.log("[PQ] below-threshold", JSON.stringify({
            tag:        "process-queue/below-threshold",
            candidateId,
            score:      belowThreshold.score,
            threshold:  belowThreshold.threshold,
            action:     belowThreshold.action,
          }))

          results.push({
            id:     resp.hhResponseId,
            name:   resp.candidateName,
            action: belowThreshold.action === "reject" ? "ai_rejected" : "ai_kept_new",
          })
        } catch (btErr) {
          console.error("[PQ] below-threshold handling failed:",
            btErr instanceof Error ? btErr.message : btErr)
        }
      }

      // Дальше — отправка приглашения и шедул дожима. Под minScore-блок
      // (belowThreshold) ничего из этого не выполняется: кандидат уже либо
      // в "rejected" с отправленным отказом, либо помечен ручным разбором.
      if (!belowThreshold) {

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
          ? (aiSettings.reInviteMessage?.trim() || aiSettings.inviteMessage?.trim() || DEMO_INVITE_MESSAGE)
          : (aiSettings.inviteMessage?.trim() || DEMO_INVITE_MESSAGE)

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
        const rawResumeRaw = raw?.resume?.["id"]
        const rawResume = typeof rawResumeRaw === "string" ? rawResumeRaw : undefined
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
            // Мерджим кастомные тексты (могут быть короче 9) с дефолтами —
            // generateTouchSchedule адресует слоты по messageIndexes из пресета.
            const messages = mergeMessagesWithDefaults(campaign.customMessages, DEFAULT_FOLLOWUP_NOT_OPENED)
            // Д0 = дата отклика на hh (negotiation.created_at).
            // Если её нет в raw_data — fallback на момент разбора.
            const rawCreatedAt = (raw as { created_at?: string } | null)?.created_at
              ?? (raw?.["negotiation"] as { created_at?: string } | undefined)?.created_at
            const parsedD0 = rawCreatedAt ? new Date(rawCreatedAt) : null
            const d0Date   = parsedD0 && !Number.isNaN(parsedD0.getTime()) ? parsedD0 : new Date()
            const d0Source: "hh_response" | "manual_review" =
              parsedD0 && !Number.isNaN(parsedD0.getTime()) ? "hh_response" : "manual_review"
            // Свежий отклик — кандидат ещё не открыл демо, ставим ветку А.
            const touches = generateTouchSchedule({
              campaignId:  campaign.id,
              candidateId,
              preset:      campaign.preset,
              d0Date,
              d0Source,
              messages,
              branch:      "not_opened",
              vacancy:     localVac,
            })
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
      } // конец if (!belowThreshold) — отказ/keep_new обработан выше отдельной веткой
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
