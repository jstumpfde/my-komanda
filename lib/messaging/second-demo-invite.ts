/**
 * «2-я часть демо» (Путь менеджера) после прохождения анкеты.
 *
 * Когда кандидат отвечает на task-вопросы демо (answer-route), мы считаем
 * ДЕТЕРМИНИРОВАННЫЙ балл по вопросам-выбора (lib/demo/objective-gate). Если в
 * Портрете включён spec.anketaPassInvite и балл >= passThreshold — выставляем
 * кандидату override-блок «Путь менеджера» (его покажет /demo/[token]) и ставим
 * в очередь follow_up_messages приглашение (branch='second_demo_invite').
 * Cron /api/cron/follow-up подберёт и отправит через hh-чат с {{demo_link}},
 * указывающим уже на 2-ю часть.
 *
 * OFF by default: при anketaPassInvite.enabled !== true ничего не делает.
 * Дедуп: один кандидат не получит приглашение дважды (override уже стоит ИЛИ
 * есть pending/sent касание этой ветки).
 *
 * Паттерн скопирован с lib/messaging/anketa-auto-reply.ts (ensureCampaign +
 * insert в follow_up_messages с respectSchedule).
 */

import { eq, and, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  candidates,
  demos,
  followUpCampaigns,
  followUpMessages,
  vacancies,
} from "@/lib/db/schema"
import { getSpec } from "@/lib/core/spec/store"
import { isFollowUpPreset } from "@/lib/followup/presets"
import { generateTouchSchedule, mergeMessagesWithDefaults } from "@/lib/followup/schedule"
import { DEFAULT_TEST_NOT_OPENED } from "@/lib/followup/default-messages"
import { computeObjectiveGateScore } from "@/lib/demo/objective-gate"
import { adjustToWorkingWindow } from "@/lib/schedule/can-send-now"
import {
  DEFAULT_AI_EVAL_THRESHOLD,
  decideAnketaPassGate,
  resolveTransferMode,
  shouldSendPassInviteMessage,
} from "@/lib/demo/anketa-pass-gate"

const DEFAULT_TEXT =
  "{{name}}, отлично — вы прошли анкету! Приглашаем вас на следующий этап: {{demo_link}}"

async function ensureCampaign(vacancyId: string): Promise<string | null> {
  const [existing] = await db
    .select({ id: followUpCampaigns.id })
    .from(followUpCampaigns)
    .where(eq(followUpCampaigns.vacancyId, vacancyId))
    .limit(1)
  if (existing) return existing.id
  const [created] = await db
    .insert(followUpCampaigns)
    .values({
      vacancyId,
      preset:              "off",
      enabled:             false,
      stopOnReply:         true,
      stopOnVacancyClosed: true,
    })
    .returning({ id: followUpCampaigns.id })
  return created?.id ?? null
}

/**
 * Read-only описание решения по приглашению на 2-ю часть (для карточки кандидата).
 * НЕ пишет в БД. Повторяет гейт maybeScheduleSecondDemoInvite, чтобы HR видел
 * ПОЧЕМУ кандидат приглашён/не приглашён (балл vs порог), а не гадал.
 *
 * @returns null — фича выключена в Портрете (баннер не показываем).
 */
export async function describeSecondDemoInvite(
  candidateId: string,
  vacancyId:   string,
): Promise<{
  invited:         boolean       // приглашение уже отправлено/запланировано (override стоит)
  score:           number | null // объективный балл по выбору (гейт), null — нет оцениваемых вопросов
  threshold:       number        // порог объективного балла из Портрета
  aiEvalScore:     number | null // AI-оценка ответов анкеты (demo_answers_score), null — ещё не посчитана
  aiEvalThreshold: number        // порог AI-оценки из Портрета
  passed:          boolean | null // ИЛИ-гейт взят (объективный ИЛИ AI-оценка); null если оба балла неизвестны
  blockTitle:      string | null // название целевого блока «Путь менеджера»
} | null> {
  try {
    const spec = await getSpec(vacancyId)
    const ap = spec?.anketaPassInvite
    if (!ap || ap.enabled !== true) return null

    const [cand] = await db
      .select({
        overrideContentBlockId: candidates.overrideContentBlockId,
        secondDemoInvitedAt:    candidates.secondDemoInvitedAt,
        demoAnswersScore:       candidates.demoAnswersScore,
      })
      .from(candidates)
      .where(and(eq(candidates.id, candidateId), eq(candidates.vacancyId, vacancyId)))
      .limit(1)
    if (!cand) return null
    const invited = !!(cand.overrideContentBlockId || cand.secondDemoInvitedAt)

    let blockTitle: string | null = null
    if (ap.contentBlockId) {
      const [b] = await db
        .select({ title: demos.title })
        .from(demos)
        .where(and(eq(demos.vacancyId, vacancyId), eq(demos.id, ap.contentBlockId)))
        .limit(1)
      blockTitle = b?.title ?? null
    }

    const result = await computeObjectiveGateScore(candidateId, vacancyId)
    const score = result ? result.score : null
    const threshold = ap.passThreshold
    const aiEvalScore = typeof cand.demoAnswersScore === "number" ? cand.demoAnswersScore : null
    const aiEvalThreshold = typeof ap.aiEvalThreshold === "number" ? ap.aiEvalThreshold : DEFAULT_AI_EVAL_THRESHOLD

    // ИЛИ-гейт: тот же критерий (единый источник истины), что в
    // maybeScheduleSecondDemoInvite — lib/demo/anketa-pass-gate.ts.
    const gate = decideAnketaPassGate(
      { objectiveScore: score, aiEvalScore },
      { passThreshold: threshold, aiEvalThreshold },
    )
    const passed = gate.passed ? true : (gate.reason === "not_applicable" ? null : false)

    return { invited, score, threshold, aiEvalScore, aiEvalThreshold, passed, blockTitle }
  } catch {
    return null
  }
}


// Дожим «не открыл 2-ю часть» (Юрий 04.07): переиспользуем test-ветку кампании
// (test_enabled/test_preset/test_messages — тексты переписаны под «Путь
// менеджера»). Ставится при выдаче override (оба режима: seamless и письмо).
// Гаснет: при открытии 2-й части (switchToTestBranchOpened в GET /demo) и при
// её прохождении (guard в cron follow-up: completedAt > second_demo_invited_at).
async function scheduleSecondDemoDozhim(candidateId: string, vacancyId: string, campaignId: string): Promise<void> {
  try {
    const [cfg] = await db
      .select({
        testEnabled:  followUpCampaigns.testEnabled,
        testPreset:   followUpCampaigns.testPreset,
        testMessages: followUpCampaigns.testMessages,
      })
      .from(followUpCampaigns)
      .where(eq(followUpCampaigns.id, campaignId))
      .limit(1)
    const on = !!cfg?.testEnabled && isFollowUpPreset(cfg.testPreset) && cfg.testPreset !== "off"
    if (!on) return
    // Дедуп: цепочка уже стоит.
    const [existing] = await db
      .select({ id: followUpMessages.id })
      .from(followUpMessages)
      .where(and(
        eq(followUpMessages.candidateId, candidateId),
        inArray(followUpMessages.branch, ["test_not_opened", "test_opened_not_submitted"]),
        inArray(followUpMessages.status, ["pending", "sent"]),
      ))
      .limit(1)
    if (existing) return
    const [vacSched] = await db
      .select({
        scheduleEnabled:            vacancies.scheduleEnabled,
        scheduleStart:              vacancies.scheduleStart,
        scheduleEnd:                vacancies.scheduleEnd,
        scheduleTimezone:           vacancies.scheduleTimezone,
        scheduleWorkingDays:        vacancies.scheduleWorkingDays,
        scheduleExcludedHolidayIds: vacancies.scheduleExcludedHolidayIds,
        scheduleCustomHolidays:     vacancies.scheduleCustomHolidays,
      })
      .from(vacancies)
      .where(eq(vacancies.id, vacancyId))
      .limit(1)
    const msgs = mergeMessagesWithDefaults(cfg!.testMessages, DEFAULT_TEST_NOT_OPENED)
    const touches = generateTouchSchedule({
      campaignId,
      candidateId,
      preset:     cfg!.testPreset as "soft" | "standard" | "aggressive",
      d0Date:     new Date(),
      d0Source:   "test_invite",
      messages:   msgs,
      branch:     "test_not_opened",
      vacancy:    vacSched ?? {},
      customDays: null,
    })
    if (touches.length > 0) await db.insert(followUpMessages).values(touches)
  } catch (err) {
    console.error("[second-demo-invite] dozhim schedule failed:", err instanceof Error ? err.message : err)
  }
}

export async function maybeScheduleSecondDemoInvite(args: {
  candidateId: string
  vacancyId:   string
}): Promise<{ scheduled: boolean; reason?: string; score?: number; scheduledAt?: string }> {
  try {
    // 1. Конфиг из Портрета. Защищаемся от undefined (getSpec не применяет
    //    дефолты схемы — см. инцидент 30.06).
    const spec = await getSpec(args.vacancyId)
    const ap = spec?.anketaPassInvite
    if (!ap || ap.enabled !== true) return { scheduled: false, reason: "disabled" }

    // 2. Дедуп: override уже стоит → кандидат уже приглашён.
    //    Заодно берём demo_answers_score — вход ИЛИ-ветки гейта (см. шаг 4).
    const [cand] = await db
      .select({
        overrideContentBlockId: candidates.overrideContentBlockId,
        secondDemoInvitedAt:    candidates.secondDemoInvitedAt,
        demoAnswersScore:       candidates.demoAnswersScore,
      })
      .from(candidates)
      .where(and(eq(candidates.id, args.candidateId), eq(candidates.vacancyId, args.vacancyId)))
      .limit(1)
    if (!cand) return { scheduled: false, reason: "candidate_missing" }
    if (cand.overrideContentBlockId || cand.secondDemoInvitedAt) {
      return { scheduled: false, reason: "already_invited" }
    }

    // 3. Целевой блок «Путь менеджера» обязателен (иначе ссылка вела бы на боевое демо).
    const blockId = ap.contentBlockId
    if (!blockId) return { scheduled: false, reason: "no_content_block" }
    // Блок должен существовать у этой вакансии.
    const [blockRow] = await db
      .select({ id: demos.id })
      .from(demos)
      .where(and(eq(demos.vacancyId, args.vacancyId), eq(demos.id, blockId)))
      .limit(1)
    if (!blockRow) return { scheduled: false, reason: "content_block_not_found" }

    // 4. ИЛИ-гейт (lib/demo/anketa-pass-gate.ts — единственный источник истины):
    //    пропускаем во 2-ю часть, если ЛЮБОЕ из двух:
    //    (а) объективный балл по выбору >= passThreshold, ИЛИ
    //    (б) AI-оценка ответов анкеты (demo_answers_score) >= aiEvalThreshold.
    //    Так сильные по сути ответы проходят даже при низком объективном балле.
    //    - Объективный балл: null, если у вакансии нет оцениваемых вопросов-выбора
    //      или у кандидата нет ответов (тогда ветка (а) не срабатывает).
    //    - AI-оценка: null, если ещё не посчитана. С 05.07 answer-route ЖДЁТ
    //      scoreDemoAnswers (с потолком) перед вызовом этой функции, когда
    //      anketaPassInvite.enabled — так что здесь она уже почти всегда готова
    //      (осечка бесшовного перехода по AI-ветке гейта, фикс 05.07).
    const result = await computeObjectiveGateScore(args.candidateId, args.vacancyId)
    const objectiveScore = result ? result.score : null
    const aiEvalScore = typeof cand.demoAnswersScore === "number" ? cand.demoAnswersScore : null
    const aiEvalThreshold = typeof ap.aiEvalThreshold === "number" ? ap.aiEvalThreshold : DEFAULT_AI_EVAL_THRESHOLD

    const gate = decideAnketaPassGate(
      { objectiveScore, aiEvalScore },
      { passThreshold: ap.passThreshold, aiEvalThreshold },
    )

    if (!gate.passed) {
      // Сохраняем прежние строки reason наружу (читает reapply-anketa-gate/карточка).
      if (gate.reason === "not_applicable") {
        return { scheduled: false, reason: "no_objective_questions" }
      }
      return {
        scheduled: false,
        reason:    "below_threshold",
        score:     gate.score ?? undefined,
      }
    }
    const gateScore = gate.score

    // Режим перехода на блок 2. Обратная совместимость: старые спеки без
    // transferMode, но с inlineContinue=false → трактуем как "message".
    const transferMode = resolveTransferMode(ap)

    // 5a. Бесшовный режим (seamless): письмо НЕ шлём — кандидат перейдёт на блок 2
    //     прямо на странице. Но override ВСЁ РАВНО ставим (GET отдаст блок 2,
    //     плюс дедуп-флаг). Атомарности с insert тут не нужно — insert-а нет.
    if (!shouldSendPassInviteMessage(transferMode)) {
      await db.update(candidates)
        .set({ overrideContentBlockId: blockId, secondDemoInvitedAt: new Date() })
        .where(eq(candidates.id, args.candidateId))

      const seamlessCampaignId = await ensureCampaign(args.vacancyId)
      if (seamlessCampaignId) await scheduleSecondDemoDozhim(args.candidateId, args.vacancyId, seamlessCampaignId)
      console.log("[second-demo-invite]", JSON.stringify({
        tag:             "second-demo-invite/seamless",
        candidateId:     args.candidateId,
        vacancyId:       args.vacancyId,
        score:           gateScore,
        gate:            gate.via,
        objectiveScore,
        aiEvalScore,
        passThreshold:   ap.passThreshold,
        aiEvalThreshold,
        blockId,
        transferMode,
      }))
      return { scheduled: true, score: gateScore }
    }

    // 5. Гарантируем кампанию (follow_up_messages.campaign_id NOT NULL).
    const campaignId = await ensureCampaign(args.vacancyId)
    if (!campaignId) return { scheduled: false, reason: "campaign_upsert_failed" }

    // 6. Дедуп по очереди (страховка от гонки параллельных ответов).
    const [existing] = await db
      .select({ id: followUpMessages.id })
      .from(followUpMessages)
      .where(and(
        eq(followUpMessages.candidateId, args.candidateId),
        eq(followUpMessages.branch, "second_demo_invite"),
        inArray(followUpMessages.status, ["pending", "sending", "sent"]),
      ))
      .limit(1)
    if (existing) return { scheduled: false, reason: "already_scheduled", score: gateScore }

    // 7. Расписание вакансии (сдвигаем отправку в рабочее окно).
    const [vac] = await db
      .select({
        scheduleEnabled:            vacancies.scheduleEnabled,
        scheduleStart:              vacancies.scheduleStart,
        scheduleEnd:                vacancies.scheduleEnd,
        scheduleTimezone:           vacancies.scheduleTimezone,
        scheduleWorkingDays:        vacancies.scheduleWorkingDays,
        scheduleExcludedHolidayIds: vacancies.scheduleExcludedHolidayIds,
        scheduleCustomHolidays:     vacancies.scheduleCustomHolidays,
      })
      .from(vacancies)
      .where(eq(vacancies.id, args.vacancyId))
      .limit(1)

    let scheduledAt = new Date(Date.now() + Math.max(0, ap.delaySeconds) * 1000)
    if (vac) {
      const { adjusted } = adjustToWorkingWindow(scheduledAt, {
        scheduleEnabled:            vac.scheduleEnabled,
        scheduleStart:              vac.scheduleStart,
        scheduleEnd:                vac.scheduleEnd,
        scheduleTimezone:           vac.scheduleTimezone,
        scheduleWorkingDays:        vac.scheduleWorkingDays,
        scheduleExcludedHolidayIds: vac.scheduleExcludedHolidayIds,
        scheduleCustomHolidays:     vac.scheduleCustomHolidays as { from: string; to: string; label: string }[] | null,
      })
      scheduledAt = adjusted
    }

    const messageText = ap.messageText && ap.messageText.trim().length > 0
      ? ap.messageText.trim()
      : DEFAULT_TEXT

    // 8. Выставляем override (ссылка {{demo_link}} теперь ведёт на 2-ю часть) и
    //    ставим приглашение в очередь. Override + invitedAt = дедуп-флаг.
    //    Атомарно (транзакция): иначе сбой между update и insert оставлял бы
    //    override без сообщения — «помечен приглашённым, но ссылка не ушла»
    //    (часть корня инцидента 30.06). Оба шага либо есть, либо нет.
    await db.transaction(async (tx) => {
      await tx.update(candidates)
        .set({ overrideContentBlockId: blockId, secondDemoInvitedAt: new Date() })
        .where(eq(candidates.id, args.candidateId))

      await tx.insert(followUpMessages).values({
        campaignId,
        candidateId: args.candidateId,
        scheduledAt,
        touchNumber: 0,
        channel:     "hh",
        messageText,
        status:      "pending",
        branch:      "second_demo_invite",
      })
    })

    console.log("[second-demo-invite]", JSON.stringify({
      tag:             "second-demo-invite/schedule",
      candidateId:     args.candidateId,
      vacancyId:       args.vacancyId,
      score:           gateScore,
      gate:            gate.via,
      objectiveScore,
      aiEvalScore,
      passThreshold:   ap.passThreshold,
      aiEvalThreshold,
      blockId,
      scheduledAt:     scheduledAt.toISOString(),
    }))

    await scheduleSecondDemoDozhim(args.candidateId, args.vacancyId, campaignId)
    return { scheduled: true, score: gateScore, scheduledAt: scheduledAt.toISOString() }
  } catch (err) {
    console.error("[second-demo-invite] schedule failed:", err instanceof Error ? err.message : err)
    return { scheduled: false, reason: "exception" }
  }
}
