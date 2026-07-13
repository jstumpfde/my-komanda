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
  companies,
  followUpCampaigns,
  followUpMessages,
  hhResponses,
} from "@/lib/db/schema"
import type { FunnelV2Stage } from "@/lib/funnel-v2/types"
import { dozhimChainFor, effectiveStageMessageText, hhActionForStatus, normalizeFunnelV2 } from "@/lib/funnel-v2/types"
import { dozhimLinkVars } from "@/lib/funnel-v2/dozhim-link-vars"
import { getValidToken } from "@/lib/hh-helpers"
import { changeNegotiationState, sendNegotiationMessage } from "@/lib/hh-api"
import { getCandidateFirstName } from "@/lib/messaging/candidate-name"
import { startPrequalification } from "@/lib/prequalification/start"
import { renderTemplate } from "@/lib/template-renderer"
import type { FunnelV2State } from "@/lib/db/schema"
import { getAppBaseUrl } from "@/lib/funnel-v2/base-url"

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
 * Имя компании для подстановки {{company}} — без него кандидату ушёл бы
 * литерал «{{company}}» (renderTemplate оставляет неизвестные переменные).
 * Экспортируется: score-gate рендерит rejectText теми же переменными.
 */
export async function getCompanyName(companyId: string): Promise<string> {
  if (!companyId) return ""
  try {
    const [row] = await db
      .select({ name: companies.name })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1)
    return row?.name ?? ""
  } catch {
    return ""
  }
}

/**
 * Отправить сообщение кандидату через hh negotiations API.
 * Переиспользует паттерн из prequalification/start.ts.
 */
async function sendHhMessageToCandidate(
  candidateId: string,
  companyId: string,
  text: string,
  hhStatus?: string | null,
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
      // hhStatus стадии → действие hh-воронки (первичный контакт/тест/интервью/отказ).
      // null = «не менять»: текст уходит, hh-папка не трогается.
      const action = hhActionForStatus(hhStatus)
      if (action) {
        await changeNegotiationState(tokenResult.accessToken, hhRow.hhResponseId, action, text, undefined, undefined, companyId)
      } else {
        await sendNegotiationMessage(tokenResult.accessToken, hhRow.hhResponseId, text, companyId)
      }
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
  // Ветка дожима. По умолчанию — «не открыл» (dozhimChain, branch=funnelv2:<id>).
  // Для ветки «открыл-не-досмотрел» передаём { chain: dozhimChainOpened, branchSuffix: ":opened" }.
  opts?: { chain?: import("@/lib/funnel-v2/types").DozhimTouch[]; branchSuffix?: string },
): Promise<void> {
  if (stage.dozhim === "off") return

  // Цепочка касаний: явная (ветка «открыл») ИЛИ dozhimChain (ветка «не открыл») ИЛИ пресет.
  // Фолбэк-пресет берём из РЕДАКТИРУЕМОГО эталона (platform_settings['drip_templates']
  // → company override → код-сид), а не из хардкода. dozhimChain почти всегда задан
  // конструктором (он тоже строит из эталона), так что это лишь последний рубеж.
  let fallbackChain: import("@/lib/funnel-v2/types").DozhimTouch[] = []
  if (!(opts?.chain && opts.chain.length > 0) && !(stage.dozhimChain && stage.dozhimChain.length > 0)) {
    try {
      const { getDripTemplates } = await import("@/lib/funnel-v2/effective-drip-templates")
      const templates = await getDripTemplates(vacancy.companyId)
      fallbackChain = dozhimChainFor(stage.dozhim, stage.action, templates)
    } catch {
      // осечка резолвера → код-сид (dozhimChainFor без templates)
      fallbackChain = dozhimChainFor(stage.dozhim, stage.action)
    }
  }

  const chain = (opts?.chain && opts.chain.length > 0)
    ? opts.chain
    : (stage.dozhimChain && stage.dozhimChain.length > 0)
      ? stage.dozhimChain
      : fallbackChain

  if (chain.length === 0) return

  // Ищем существующую кампанию вакансии для FK.
  // Приоритет: sentinel-кампания v2 (preset='funnel_v2') → любая enabled → создаём sentinel.
  let campaign: { id: string } | undefined

  const [sentinelCampaign] = await db
    .select({ id: followUpCampaigns.id })
    .from(followUpCampaigns)
    .where(and(
      eq(followUpCampaigns.vacancyId, candidate.vacancyId),
      eq(followUpCampaigns.preset, "funnel_v2"),
    ))
    .limit(1)

  if (sentinelCampaign) {
    campaign = sentinelCampaign
  } else {
    // Пробуем переиспользовать существующую enabled-кампанию
    const [existingCampaign] = await db
      .select({ id: followUpCampaigns.id })
      .from(followUpCampaigns)
      .where(and(
        eq(followUpCampaigns.vacancyId, candidate.vacancyId),
        eq(followUpCampaigns.enabled, true),
      ))
      .limit(1)

    if (existingCampaign) {
      campaign = existingCampaign
    } else {
      // Создаём служебную sentinel-кампанию v2 для этой вакансии.
      // enabled=false — не участвует в обычном дожиме, только для FK.
      const [inserted] = await db
        .insert(followUpCampaigns)
        .values({
          vacancyId:   candidate.vacancyId,
          preset:      "funnel_v2",
          enabled:     false,
          stopOnReply: true,
          stopOnVacancyClosed: true,
        })
        .returning({ id: followUpCampaigns.id })
      campaign = inserted
      console.log("[funnel-v2/executor] создана sentinel-кампания v2", {
        campaignId:  inserted?.id,
        vacancyId:   candidate.vacancyId,
      })
    }
  }

  if (!campaign) {
    // Не удалось ни найти, ни создать кампанию — пропускаем дожим.
    console.warn("[funnel-v2/executor] дожим пропущен — не удалось создать кампанию", {
      candidateId: candidate.id,
      vacancyId:   candidate.vacancyId,
      stageId:     stage.id,
    })
    return
  }

  const now = new Date()
  const branch = `funnelv2:${stage.id}${opts?.branchSuffix ?? ""}` as string

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

  // Имя для {{name}} — безопасный резолвер (не наивный split, иначе кандидату
  // уходит ФАМИЛИЯ или «Аноним»; см. lib/messaging/candidate-name.ts).
  const { firstName } = await getCandidateFirstName(candidate.id)

  // {{company}} в текстах касаний: имя компании (иначе ушёл бы литерал).
  // companyId бывает не заполнен у caller-а (switchV2BranchOpened) — добираем
  // по вакансии кандидата.
  let dozhimCompanyId = vacancy.companyId ?? ""
  if (!dozhimCompanyId) {
    try {
      const [v] = await db
        .select({ companyId: vacancies.companyId })
        .from(vacancies)
        .where(eq(vacancies.id, candidate.vacancyId))
        .limit(1)
      dozhimCompanyId = v?.companyId ?? ""
    } catch { /* company останется пустой строкой */ }
  }
  const dozhimCompanyName = await getCompanyName(dozhimCompanyId)

  // Ссылки этапа: {{test_link}} обязателен (дефолтные шаблоны дожима test/task
  // используют его — иначе кандидату уходит литерал); для test/task-стадий
  // {{demo_link}} тоже ведёт на /test-URL (дожим зовёт к артефакту стадии).
  const linkVars = dozhimLinkVars(stage.action, candidate.token, getAppBaseUrl())

  // Формируем касания по цепочке
  const touches = chain.map((touch, idx) => {
    const delayMs = touch.delayDays * 24 * 60 * 60 * 1000
    const scheduledAt = new Date(now.getTime() + delayMs)
    const messageText = renderTemplate(touch.text, {
      name:      firstName,
      vacancy:   vacancy.title || "",
      company:   dozhimCompanyName,
      ...linkVars,
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
  const baseUrl = getAppBaseUrl()
  const demoUrl = `${baseUrl}/demo/${tokenForUrl}`
  // Общий набор переменных рендера для всех типов стадий. {{company}} и
  // {{demo_link}} подставляются ВЕЗДЕ (message/interview/offer тоже) — кнопки
  // плейсхолдеров в редакторе честные, литералы кандидату не уходят.
  const companyName = await getCompanyName(companyId)
  const baseVars: Record<string, string> = {
    name:      firstName,
    vacancy:   vacancy.title ?? "",
    company:   companyName,
    demo_link: demoUrl,
  }

  let result: StageEntryResult

  switch (stage.action) {

    // ── Сообщение / касание ────────────────────────────────────────────────
    case "message": {
      // Текст стадии — эффективные сообщения редактора (stage.messages,
      // fallback на устаревший messagePresetId; несколько → join через пустую
      // строку, см. effectiveStageMessageText). Пусто → стандартный текст.
      const customMsg = effectiveStageMessageText(stage)
      const text = customMsg
        ? renderTemplate(customMsg, baseVars)
        : renderTemplate(
            `${firstName}, добрый день! Хотели уточнить — актуальна ли для вас вакансия «${vacancy.title ?? ""}»?`,
            baseVars,
          )

      const sent = await sendHhMessageToCandidate(candidate.id, companyId, text, stage.hhStatus)
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
      // Эффективные сообщения редактора (messages → fallback messagePresetId)
      const customDemo = effectiveStageMessageText(stage)
      const inviteText = customDemo
        ? renderTemplate(customDemo, baseVars)
        : renderTemplate(
            `${firstName}, здравствуйте! Подготовили демонстрацию — 15 минут, и вы узнаете всё о задачах, команде и доходе.\n\n${demoUrl}`,
            baseVars,
          )
      // Убеждаемся, что URL в сообщении есть
      const finalText = inviteText.includes("/demo/")
        ? inviteText
        : inviteText + "\n\n" + demoUrl

      const sent = await sendHhMessageToCandidate(candidate.id, companyId, finalText, stage.hhStatus)
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
      const testUrl = `${baseUrl}/test/${tokenForUrl}`

      // Текст приглашения: из messagePresetId (TODO Фаза 4: broadcastTemplates)
      // или стандартный в зависимости от action (тест-вопросы vs тест-задание).
      const isTask = stage.action === "task"
      const inviteBody = isTask
        ? `${firstName}, следующий шаг — практическое задание. Выполните и пришлите ответ по ссылке:\n\n${testUrl}`
        : `${firstName}, следующий шаг — небольшой тест. Займёт несколько минут. Пройдите по ссылке:\n\n${testUrl}`

      // Эффективные сообщения редактора (messages → fallback messagePresetId)
      const customTest = effectiveStageMessageText(stage)
      const testVars = { ...baseVars, test_link: testUrl }
      const testText = customTest
        ? renderTemplate(customTest, testVars)
        : renderTemplate(inviteBody, testVars)

      // Убеждаемся, что ссылка на тест в сообщении есть
      const finalTestText = testText.includes("/test/")
        ? testText
        : testText + "\n\n" + testUrl

      const sent = await sendHhMessageToCandidate(candidate.id, companyId, finalTestText, stage.hhStatus)
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

      // Текст стадии («Сообщение кандидату») — тело приглашения. Если HR его
      // задал — рендерим с токенами (HR сам впишет ссылку-самозапись, если нужна).
      // Иначе — стандартный текст с просьбой написать удобное время.
      // Эффективные сообщения редактора (messages → fallback messagePresetId)
      const customInterview = effectiveStageMessageText(stage)
      const interviewText = customInterview
        ? renderTemplate(customInterview, baseVars)
        : renderTemplate(
            `${firstName}, поздравляем! Следующий шаг — собеседование ${modeLabel[mode]} по вакансии «${vacancy.title ?? ""}».\n\nНапишите, пожалуйста, когда вам удобно встретиться (дата и время).`,
            baseVars,
          )
      void hasSelfLink

      const sentInterview = await sendHhMessageToCandidate(candidate.id, companyId, interviewText, stage.hhStatus)
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
      // Эффективные сообщения редактора (messages → fallback messagePresetId)
      const customOffer = effectiveStageMessageText(stage)
      const offerText = customOffer
        ? renderTemplate(customOffer, baseVars)
        : renderTemplate(
            `${firstName}, поздравляем! Мы готовы сделать вам оффер по вакансии «${vacancy.title ?? ""}». HR напишет вам с деталями в ближайшее время.`,
            baseVars,
          )

      const sentOffer = await sendHhMessageToCandidate(candidate.id, companyId, offerText, stage.hhStatus)
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
      // Прощание стадии (Воронка 3): шлём ТОЛЬКО если HR задал текст в
      // редакторе (видимое поле). Пусто = как раньше, ничего не отправляем.
      const farewell = (stage.farewellText ?? "").trim()
      if (farewell) {
        const farewellText = renderTemplate(farewell, baseVars)
        const sentFarewell = await sendHhMessageToCandidate(candidate.id, companyId, farewellText, stage.hhStatus)
        if (!sentFarewell) {
          console.warn("[funnel-v2/executor] прощание не отправлено", {
            candidateId: candidate.id, stageId: stage.id,
          })
        }
      }
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
        holdReason:              null,
        middlePrequalFromStageId: prevState?.middlePrequalFromStageId ?? null,
      }

      await db.update(candidates)
        .set({
          stage:             "hired",
          hiredAt:           now, // дата события найма (аудит 10.07, отчёт)
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

    // ── Остальные (СБ, реф-чек, решение): no-op — ждём ручного продвижения HR ──
    case "security_check":
    case "reference_check":
    case "decision": {
      // TODO (Фаза 3, security_check/reference_check): отдельная логика проверок.
      // decision — намеренно no-op: это ручной этап ожидания финального
      // решения HR, автоматике тут нечего делать.
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

/**
 * Переключение ветки дожима v2 при ОТКРЫТИИ демо/теста кандидатом.
 * Аналог legacy switchToBranchOpened, но для v2-веток (branch=funnelv2:<stageId>).
 *
 * Когда кандидат открывает /demo/<token>, касания ветки «не открыл» (текст
 * «откройте демо») больше не актуальны. Отменяем pending-касания
 * branch=`funnelv2:<stageId>` и, если у текущей стадии задана dozhimChainOpened,
 * планируем ветку «открыл, но не досмотрел» (branch=`funnelv2:<stageId>:opened`)
 * от текущего момента. Если dozhimChainOpened пуст — просто отменяем ветку А.
 *
 * Дёргается из app/api/public/demo/[token]/visit (рядом с legacy switchToBranchOpened),
 * только для кандидатов на v2 (funnelV2StateJson != null).
 */
export async function switchV2BranchOpened(candidateId: string): Promise<{
  switched: boolean
  cancelled: number
  scheduledOpened: number
  reason?: string
}> {
  const [cand] = await db
    .select({
      id:                candidates.id,
      token:             candidates.token,
      name:              candidates.name,
      email:             candidates.email,
      phone:             candidates.phone,
      vacancyId:         candidates.vacancyId,
      funnelV2StateJson: candidates.funnelV2StateJson,
    })
    .from(candidates)
    .where(eq(candidates.id, candidateId))
    .limit(1)
  if (!cand) return { switched: false, cancelled: 0, scheduledOpened: 0, reason: "candidate_not_found" }

  const state = cand.funnelV2StateJson as FunnelV2State | null
  if (!state?.stageId) return { switched: false, cancelled: 0, scheduledOpened: 0, reason: "not_on_v2" }

  const [vac] = await db
    .select({ title: vacancies.title, descriptionJson: vacancies.descriptionJson })
    .from(vacancies)
    .where(eq(vacancies.id, cand.vacancyId))
    .limit(1)
  if (!vac) return { switched: false, cancelled: 0, scheduledOpened: 0, reason: "vacancy_not_found" }

  const descJson = vac.descriptionJson as { funnelV2?: unknown } | null
  const funnelV2 = normalizeFunnelV2(descJson?.funnelV2)
  const stage = funnelV2.stages.find(s => s.id === state.stageId)
  if (!stage) return { switched: false, cancelled: 0, scheduledOpened: 0, reason: "stage_not_found" }

  // Шаг 1: отменить ветку «не открыл» (branch=funnelv2:<stageId>, БЕЗ суффикса).
  const cancelled = await db
    .update(followUpMessages)
    .set({ status: "cancelled", errorMessage: "v2_branch_switched" })
    .where(and(
      eq(followUpMessages.candidateId, candidateId),
      eq(followUpMessages.branch, `funnelv2:${stage.id}`),
      eq(followUpMessages.status, "pending"),
    ))
    .returning({ id: followUpMessages.id })

  // Шаг 2: если есть ветка «открыл-не-досмотрел» — запланировать её от текущего момента.
  let scheduledOpened = 0
  if (stage.dozhimChainOpened && stage.dozhimChainOpened.length > 0) {
    const candidateForExec: CandidateForExecutor = {
      id: cand.id, token: cand.token, name: cand.name,
      email: cand.email, phone: cand.phone, vacancyId: cand.vacancyId,
      funnelV2StateJson: state,
    }
    const vacancyForExec = { id: cand.vacancyId, title: vac.title } as unknown as VacancyForExecutor
    const before = await db
      .select({ id: followUpMessages.id })
      .from(followUpMessages)
      .where(and(
        eq(followUpMessages.candidateId, candidateId),
        eq(followUpMessages.branch, `funnelv2:${stage.id}:opened`),
        eq(followUpMessages.status, "pending"),
      ))
    await scheduleV2Dozhim(candidateForExec, vacancyForExec, stage, {
      chain: stage.dozhimChainOpened,
      branchSuffix: ":opened",
    })
    const after = await db
      .select({ id: followUpMessages.id })
      .from(followUpMessages)
      .where(and(
        eq(followUpMessages.candidateId, candidateId),
        eq(followUpMessages.branch, `funnelv2:${stage.id}:opened`),
        eq(followUpMessages.status, "pending"),
      ))
    scheduledOpened = Math.max(0, after.length - before.length)
  }

  console.log("[funnel-v2/branch-switch]", JSON.stringify({
    candidateId, stageId: stage.id, cancelled: cancelled.length, scheduledOpened,
  }))
  return { switched: true, cancelled: cancelled.length, scheduledOpened }
}
