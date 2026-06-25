/**
 * Рантайм воронки v2 — исполнитель входа в стадию.
 *
 * Фаза 0: только сигнатура + структура.
 * Фаза 1: реализованы action: message, demo, prequalification; дожим на стадию.
 * Фаза 3: реализованы action: test/task, interview, offer, hired.
 *
 * НЕ подключён к cron, не вызывается при флаге=false (гейт в process-queue).
 */

import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  candidates,
  vacancies,
  followUpCampaigns,
  followUpMessages,
  hhResponses,
} from "@/lib/db/schema"
import type { FunnelV2Stage } from "@/lib/funnel-v2/types"
import { dozhimChainFor } from "@/lib/funnel-v2/types"
import { getValidToken } from "@/lib/hh-helpers"
import { changeNegotiationState } from "@/lib/hh-api"
import { getCandidateFirstName } from "@/lib/messaging/candidate-name"
import { startPrequalification } from "@/lib/prequalification/start"
import { renderTemplate } from "@/lib/template-renderer"
import type { FunnelV2State } from "@/lib/db/schema"

// ── Минимальные срезы строк БД, чтобы не тащить весь Drizzle InferSelect ───────

/** Минимальный срез кандидата, нужный исполнителю стадии. */
export interface CandidateForExecutor {
  id: string
  token: string
  name: string
  email: string | null
  phone: string | null
  vacancyId: string
  /** Текущее состояние v2-воронки (null = только вошёл в воронку). */
  funnelV2StateJson: FunnelV2State | null
}

/** Минимальный срез вакансии, нужный исполнителю стадии. */
export interface VacancyForExecutor {
  id: string
  title?: string | null
  companyId?: string
  /** Конфиг воронки v2 из descriptionJson.funnelV2 (уже распакованный). */
  funnelV2: import("@/lib/funnel-v2/types").FunnelV2Config
  /** Флаг рантайма v2 (должен быть true, иначе исполнитель не должен вызываться). */
  funnelV2RuntimeEnabled: boolean
  // Поля расписания для generateTouchSchedule (нужны для adjustToWorkingWindow)
  scheduleEnabled?: boolean | null
  scheduleStart?: string | null
  scheduleEnd?: string | null
  scheduleTimezone?: string | null
  scheduleWorkingDays?: number[] | null
  scheduleExcludedHolidayIds?: string[] | null
}

/** Результат исполнения входа в стадию. */
export interface StageEntryResult {
  /** Действие, которое предпринял исполнитель. */
  action: "message_sent" | "demo_link_sent" | "test_link_sent" | "prequalification_started"
    | "interview_link_sent" | "offer_sent" | "auto_advanced" | "hired" | "noop"
  /** Человекочитаемое описание (для логов). */
  description: string
}

// ────────────────────────────────────────────────────────────────────────────────
// Вспомогательные функции
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Отправить сообщение кандидату через hh negotiations API.
 * Переиспользует паттерн из prequalification/start.ts.
 */
async function sendHhMessageToCandidate(
  candidateId: string,
  companyId: string,
  text: string,
): Promise<boolean> {
  try {
    const [hhRow] = await db
      .select({ hhResponseId: hhResponses.hhResponseId })
      .from(hhResponses)
      .where(eq(hhResponses.localCandidateId, candidateId))
      .limit(1)
    if (!hhRow?.hhResponseId) return false

    const tokenResult = await getValidToken(companyId)
    if (!tokenResult) return false

    try {
      await changeNegotiationState(
        tokenResult.accessToken,
        hhRow.hhResponseId,
        "invitation",
        text,
      )
      return true
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // already_applied — сообщение всё равно дошло (hh-идемпотентность)
      if (msg.includes("already_applied")) return true
      console.warn("[funnel-v2/executor] hh send failed:", msg)
      return false
    }
  } catch (err) {
    console.warn("[funnel-v2/executor] sendHhMessage error:", err instanceof Error ? err.message : err)
    return false
  }
}

/**
 * Запланировать дожим v2-стадии через follow_up_messages.
 *
 * Переиспользуем таблицу follow_up_messages, передавая branch=`funnelv2:<stageId>`.
 * Для FK campaign_id берём существующую кампанию вакансии (если есть).
 * Если кампании нет — дожим не запускается (TODO Фаза 2: создавать sentinel-кампанию v2).
 */
async function scheduleV2Dozhim(
  candidate: CandidateForExecutor,
  vacancy: VacancyForExecutor,
  stage: FunnelV2Stage,
): Promise<void> {
  if (stage.dozhim === "off") return

  // Цепочка касаний из доzhimChain или по пресету
  const chain = (stage.dozhimChain && stage.dozhimChain.length > 0)
    ? stage.dozhimChain
    : dozhimChainFor(stage.dozhim, stage.action)

  if (chain.length === 0) return

  // Ищем существующую кампанию вакансии для FK
  const [campaign] = await db
    .select({ id: followUpCampaigns.id })
    .from(followUpCampaigns)
    .where(and(
      eq(followUpCampaigns.vacancyId, candidate.vacancyId),
      eq(followUpCampaigns.enabled, true),
    ))
    .limit(1)

  if (!campaign) {
    // Дожим невозможен без кампании (FK NOT NULL); логируем и выходим.
    // TODO (Фаза 2): создавать sentinel-кампанию v2 или отдельную таблицу.
    console.warn("[funnel-v2/executor] дожим пропущен — нет кампании для вакансии", {
      candidateId: candidate.id,
      vacancyId:   candidate.vacancyId,
      stageId:     stage.id,
    })
    return
  }

  const now = new Date()
  const branch = `funnelv2:${stage.id}` as string

  // Проверяем дедуп: уже есть pending-касания с этим branch?
  const { isNull: drizzleIsNull, inArray } = await import("drizzle-orm")
  const existing = await db
    .select({ id: followUpMessages.id })
    .from(followUpMessages)
    .where(and(
      eq(followUpMessages.candidateId, candidate.id),
      eq(followUpMessages.campaignId, campaign.id),
      inArray(followUpMessages.status, ["pending", "sent"]),
      // branch LIKE 'funnelv2:...' — проверяем через eq (точный stageId)
      eq(followUpMessages.branch, branch),
    ))
    .limit(1)

  if (existing.length > 0) {
    // Касания уже запланированы для этой стадии
    return
  }

  // Формируем касания по цепочке
  const touches = chain.map((touch, idx) => {
    const delayMs = touch.delayDays * 24 * 60 * 60 * 1000
    const scheduledAt = new Date(now.getTime() + delayMs)
    // Подставляем имя и ссылку на демо ({{name}}, {{demo_link}})
    const tokenForUrl = candidate.token
    const demoUrl = `https://company24.pro/demo/${tokenForUrl}`
    const messageText = renderTemplate(touch.text, {
      name:      candidate.name.split(" ")[0] || candidate.name,
      demo_link: demoUrl,
      vacancy:   vacancy.title || "",
    })
    return {
      campaignId:    campaign.id,
      candidateId:   candidate.id,
      scheduledAt,
      touchNumber:   idx + 1,
      channel:       "hh" as const,
      messageText,
      status:        "pending" as const,
      branch,
      chainD0:       now,
      chainD0Source: "branch_switch" as const,
    }
  })

  if (touches.length > 0) {
    await db.insert(followUpMessages).values(touches)
  }
}

// ────────────────────────────────────────────────────────────────────────────────
// Основная функция
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Войти в стадию: отправить нужное действие кандидату.
 *
 * Вызывается из:
 * - process-queue (Фаза 1) при новом кандидате (входит в stages[0])
 * - advanceToNextStage при автопродвижении / ручном переводе HR-ом
 * - cron/funnel-v2-tick при периодической проверке
 *
 * @param candidate Кандидат (с актуальным funnelV2StateJson уже обновлённым на новый stageId).
 * @param vacancy   Вакансия с распакованным funnelV2 + companyId.
 * @param stage     Стадия, в которую входим.
 * @returns Результат действия (для логирования).
 */
export async function executeStageEntry(
  candidate: CandidateForExecutor,
  vacancy: VacancyForExecutor,
  stage: FunnelV2Stage,
): Promise<StageEntryResult> {
  const companyId = vacancy.companyId ?? ""
  const { firstName } = await getCandidateFirstName(candidate.id)
  const tokenForUrl = candidate.token
  const demoUrl = `https://company24.pro/demo/${tokenForUrl}`

  let result: StageEntryResult

  switch (stage.action) {

    // ── Сообщение / касание ────────────────────────────────────────────────
    case "message": {
      // Текст из messagePresetId или стандартный
      // TODO (Фаза 2): резолвить broadcastTemplates по messagePresetId.
      // Пока используем contentBlockId как fallback или стандартный текст.
      const text = stage.messagePresetId
        ? `[Шаблон ${stage.messagePresetId}] — TODO Фаза 2: загрузить из broadcastTemplates`
        : renderTemplate(
            `${firstName}, добрый день! Хотели уточнить — актуальна ли для вас вакансия «${vacancy.title ?? ""}»?`,
            { name: firstName, vacancy: vacancy.title ?? "" },
          )

      const sent = await sendHhMessageToCandidate(candidate.id, companyId, text)
      if (!sent) {
        console.warn("[funnel-v2/executor] message не отправлено", {
          candidateId: candidate.id, stageId: stage.id,
        })
      }

      // autoAdvance на message: продвигаем сразу (если нет обратной связи)
      if (stage.rule.autoAdvance) {
        // Импортируем лениво, чтобы избежать циклической зависимости
        const { advanceToNextStage } = await import("@/lib/funnel-v2/advance-stage")
        await advanceToNextStage(candidate, vacancy, { advanceTo: stage.rule.advanceTo })
        result = { action: "auto_advanced", description: `Стадия message с autoAdvance=true — сразу переводим дальше` }
        break
      }

      result = {
        action:      "message_sent",
        description: `Отправлено сообщение кандидату ${candidate.id} на стадии ${stage.id}`,
      }
      break
    }

    // ── Демонстрация ───────────────────────────────────────────────────────
    case "demo": {
      // Отправляем ссылку на /demo/<token> — контент отдаётся через resolveCurrentStageContent
      const inviteText = stage.messagePresetId
        ? renderTemplate(
            `${firstName}, подготовили для вас демонстрацию должности — посмотрите 15 минут, узнаете всё о задачах и команде.`,
            { name: firstName, vacancy: vacancy.title ?? "", demo_link: demoUrl },
          )
        : renderTemplate(
            `${firstName}, здравствуйте! Подготовили демонстрацию — 15 минут, и вы узнаете всё о задачах, команде и доходе.\n\n${demoUrl}`,
            { name: firstName, vacancy: vacancy.title ?? "", demo_link: demoUrl },
          )
      // Убеждаемся, что URL в сообщении есть
      const finalText = inviteText.includes("company24.pro/demo")
        ? inviteText
        : inviteText + "\n\n" + demoUrl

      const sent = await sendHhMessageToCandidate(candidate.id, companyId, finalText)
      if (!sent) {
        console.warn("[funnel-v2/executor] demo-ссылка не отправлена", {
          candidateId: candidate.id, stageId: stage.id, demoUrl,
        })
      }

      // Запускаем дожим на стадию (если не off)
      await scheduleV2Dozhim(candidate, vacancy, stage)

      result = {
        action:      "demo_link_sent",
        description: `Отправлена ссылка на демо ${demoUrl} кандидату ${candidate.id}`,
      }
      break
    }

    // ── Предквалификация ────────────────────────────────────────────────────
    case "prequalification": {
      // Переиспользуем существующий startPrequalification (читает вопросы из aiProcessSettings)
      const pqResult = await startPrequalification(candidate.id)
      if (!pqResult.started) {
        console.warn("[funnel-v2/executor] startPrequalification не запустился:", pqResult.reason, {
          candidateId: candidate.id, stageId: stage.id,
        })
      }
      // Дожим на предквалификацию
      await scheduleV2Dozhim(candidate, vacancy, stage)

      result = {
        action:      "prequalification_started",
        description: `Предквалификация запущена для кандидата ${candidate.id}: ${pqResult.started ? "ok" : pqResult.reason}`,
      }
      break
    }

    // ── Тест-вопросы / тест-задание ─────────────────────────────────────────
    // Фаза 3: отправляем /test/<token> — v2-ветка в route.ts отдаст контент
    // текущей стадии (contentBlockId), а не легаси kind='test'.
    case "test":
    case "task": {
      const testUrl = `https://company24.pro/test/${tokenForUrl}`

      // Текст приглашения: из messagePresetId (TODO Фаза 4: broadcastTemplates)
      // или стандартный в зависимости от action (тест-вопросы vs тест-задание).
      const isTask = stage.action === "task"
      const inviteBody = isTask
        ? `${firstName}, следующий шаг — практическое задание. Выполните и пришлите ответ по ссылке:\n\n${testUrl}`
        : `${firstName}, следующий шаг — небольшой тест. Займёт несколько минут. Пройдите по ссылке:\n\n${testUrl}`

      const testText = stage.messagePresetId
        ? renderTemplate(
            `${firstName}, следующий шаг — ${isTask ? "задание" : "тест"}. Ссылка: ${testUrl}`,
            { name: firstName, vacancy: vacancy.title ?? "", test_link: testUrl },
          )
        : renderTemplate(inviteBody, { name: firstName, vacancy: vacancy.title ?? "", test_link: testUrl })

      // Убеждаемся, что ссылка на тест в сообщении есть
      const finalTestText = testText.includes("company24.pro/test")
        ? testText
        : testText + "\n\n" + testUrl

      const sent = await sendHhMessageToCandidate(candidate.id, companyId, finalTestText)
      if (!sent) {
        console.warn("[funnel-v2/executor] test-ссылка не отправлена", {
          candidateId: candidate.id, stageId: stage.id, testUrl,
        })
      }

      // Дожим на тест-стадию (тексты из followup/default-messages TEST_NOT_OPENED)
      await scheduleV2Dozhim(candidate, vacancy, stage)

      result = {
        action:      "test_link_sent",
        description: `Отправлена ссылка на ${isTask ? "задание" : "тест"} ${testUrl} кандидату ${candidate.id}`,
      }
      break
    }

    // ── Интервью ────────────────────────────────────────────────────────────
    // Фаза 3: отправляем приглашение с учётом interviewMode и scheduling.
    // autoAdvance=false — HR переводит кандидата вручную после согласования.
    // Фаза 4 (TODO): self_link = ссылка-самозапись в Calendly/CalCom.
    case "interview": {
      const mode = stage.interviewMode ?? "phone"
      const modeLabel: Record<typeof mode, string> = {
        phone:  "по телефону",
        zoom:   "в Zoom",
        office: "в офисе",
      }

      const hasScheduling = Array.isArray(stage.scheduling) && stage.scheduling.length > 0
      const hasSelfLink = hasScheduling && stage.scheduling!.includes("self_link")

      // Если есть ссылка-самозапись и она задана в messagePresetId — используем.
      // Иначе — стандартный текст с просьбой написать удобное время.
      let interviewText: string
      if (hasSelfLink && stage.messagePresetId) {
        interviewText = renderTemplate(
          `${firstName}, следующий шаг — собеседование ${modeLabel[mode]}. Запишитесь на удобное время: ${stage.messagePresetId}`,
          { name: firstName, vacancy: vacancy.title ?? "" },
        )
      } else {
        interviewText = renderTemplate(
          `${firstName}, поздравляем! Следующий шаг — собеседование ${modeLabel[mode]} по вакансии «${vacancy.title ?? ""}».\n\nНапишите, пожалуйста, когда вам удобно встретиться (дата и время).`,
          { name: firstName, vacancy: vacancy.title ?? "" },
        )
      }

      const sentInterview = await sendHhMessageToCandidate(candidate.id, companyId, interviewText)
      if (!sentInterview) {
        console.warn("[funnel-v2/executor] интервью-приглашение не отправлено", {
          candidateId: candidate.id, stageId: stage.id,
        })
      }

      // autoAdvance=false для интервью: ждём HR (согласование времени).
      // Дожим не запускаем (у интервью reminder-логика Фаза 4).

      result = {
        action:      "interview_link_sent",
        description: `Отправлено приглашение на интервью (${mode}) кандидату ${candidate.id}`,
      }
      break
    }

    // ── Оффер ───────────────────────────────────────────────────────────────
    // Фаза 3: отправляем текст оффера. Документ — Фаза 4.
    case "offer": {
      const offerText = stage.messagePresetId
        ? renderTemplate(
            `${firstName}, рады сделать вам предложение о работе. HR свяжется с вами для обсуждения деталей.`,
            { name: firstName, vacancy: vacancy.title ?? "" },
          )
        : renderTemplate(
            `${firstName}, поздравляем! Мы готовы сделать вам оффер по вакансии «${vacancy.title ?? ""}». HR напишет вам с деталями в ближайшее время.`,
            { name: firstName, vacancy: vacancy.title ?? "" },
          )

      const sentOffer = await sendHhMessageToCandidate(candidate.id, companyId, offerText)
      if (!sentOffer) {
        console.warn("[funnel-v2/executor] оффер не отправлен", {
          candidateId: candidate.id, stageId: stage.id,
        })
      }

      // autoAdvance=false для оффера: ждём подтверждения кандидата / подписи.
      // TODO (Фаза 4): документ оффера, подпись.

      result = {
        action:      "offer_sent",
        description: `Отправлен оффер кандидату ${candidate.id}`,
      }
      break
    }

    // ── Финал — нанят ──────────────────────────────────────────────────────
    // Фаза 3: синкаем legacy stage + funnelV2State.completedAt в БД.
    case "hired": {
      const now = new Date()
      // Помечаем кандидата как нанятого в legacy stage и в v2-состоянии
      const prevState = candidate.funnelV2StateJson
      const hiredState: import("@/lib/db/schema").FunnelV2State = {
        stageId:                 prevState?.stageId ?? stage.id,
        enteredAt:               prevState?.enteredAt ?? now.toISOString(),
        completedAt:             now.toISOString(),
        scoreForStage:           prevState?.scoreForStage ?? null,
        pendingRejectionStageId: null,
        touchesSent:             prevState?.touchesSent ?? 0,
        dozhimStartedAt:         prevState?.dozhimStartedAt ?? null,
      }

      await db.update(candidates)
        .set({
          stage:             "hired",
          funnelV2StateJson: hiredState,
          updatedAt:         now,
        })
        .where(eq(candidates.id, candidate.id))

      result = {
        action:      "hired",
        description: `Кандидат ${candidate.id} нанят (финал воронки v2, legacy stage=hired)`,
      }
      break
    }

    // ── Остальные (СБ, реф-чек): no-op — реализация Фаза 3 ─────────────────
    case "security_check":
    case "reference_check": {
      // TODO (Фаза 3): отдельная логика проверок
      result = {
        action:      "noop",
        description: `action=${stage.action} пока no-op (TODO Фаза 3)`,
      }
      break
    }

    default: {
      result = {
        action:      "noop",
        description: `Неизвестный action: ${(stage as FunnelV2Stage).action}`,
      }
    }
  }

  console.log("[funnel-v2/executor]", JSON.stringify({
    tag:         "funnel-v2/stage-entry",
    candidateId: candidate.id,
    vacancyId:   candidate.vacancyId,
    stageId:     stage.id,
    action:      stage.action,
    result:      result.action,
  }))

  return result
}
