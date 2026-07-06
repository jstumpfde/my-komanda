// Инцидент 06.07.2026 (кандидат Ильин, вакансия 6916): написал в hh-чате
// «по холодным звонкам больше не собираюсь работать» (явный отказ от
// ключевого требования вакансии, Портрет-балл 0) — а дожим на следующее утро
// прислал «ваш опыт нам подходит, досмотрите обзор». Дожимы не читали ответы
// кандидата и хвалили явно неподходящего.
//
// Этот модуль — единая точка «стоп + эскалация HR» для случая, когда
// кандидат в чате явно отказался от требования/условия должности
// (classifyCandidateResponse → intent="decline_requirement", см.
// lib/ai/classify-candidate-response.ts). НИКАКОГО авто-отказа — только:
//   1. Пауза дожима этому кандидату (переиспользуем существующие
//      per-candidate флаги automationPaused/autoProcessingStopped —
//      их уже читает shouldStopFollowUp для legacy-цепочки и мы добавили
//      их проверку в v2-ветку cron/follow-up).
//   2. Отмена pending-касаний follow_up_messages (не только legacy —
//      и funnelv2:* ветки, у них тот же candidateId).
//   3. Эскалация HR на ручной разбор: in-app уведомление (createNotification,
//      всегда работает) + best-effort Telegram company-канал (sendToCompanyChannel,
//      не зависит от настроек AI-чат-бота — работает даже если чат-бот выключен).
//
// Решение по кандидату (отказ/дальше вести) остаётся за HR — ровно как для
// стоп-факторов и score-gate red zone (см. CLAUDE.md, autoProcessingStoppedReason).

import { and, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, followUpMessages, vacancies } from "@/lib/db/schema"
import { createNotification } from "@/lib/notifications"
import { sendToCompanyChannel } from "@/lib/telegram/send-to-company"
import { getAppBaseUrl } from "@/lib/funnel-v2/base-url"

// Часть до ":" совместима с lib/hr/rejection-reasons.ts::autoReasonKey/autoReasonLabel
// (отчёт по найму схлопывает детали после ":" в общую категорию).
export const DECLINE_REQUIREMENT_REASON = "decline_requirement_needs_review"

interface StageHistoryEntry {
  from:   string
  to:     string
  at:     string
  reason: string
}

export interface PauseAndEscalateArgs {
  candidateId:      string
  vacancyId:        string
  /** Сырой текст сообщения кандидата — попадёт в уведомление HR (обрезаем превью). */
  incomingText:     string
  /** Причина, попадающая в auto_processing_stopped_reason (часть до ':' — общая
   *  категория для отчёта, см. lib/hr/rejection-reasons.ts). Дефолт покрывает
   *  decline_requirement; параметр оставлен на случай будущих причин паузы. */
  reason?:          string
  confidence?:      number
}

export interface PauseAndEscalateResult {
  paused:            boolean
  alreadyPaused:     boolean
  notificationSent:  boolean
  telegramSent:      boolean
}

/**
 * Ставит дожим кандидата на паузу и эскалирует HR на ручной разбор.
 * Идемпотентна: если кандидат уже на паузе (automationPaused/autoProcessingStopped),
 * второй раз уведомление не дублирует (см. alreadyPaused).
 */
export async function pauseFollowUpAndEscalate(
  args: PauseAndEscalateArgs,
): Promise<PauseAndEscalateResult> {
  const reason = args.reason ?? DECLINE_REQUIREMENT_REASON

  const [cand] = await db
    .select({
      stage:                 candidates.stage,
      name:                  candidates.name,
      shortId:               candidates.shortId,
      token:                 candidates.token,
      automationPaused:      candidates.automationPaused,
      autoProcessingStopped: candidates.autoProcessingStopped,
      resumeScore:           candidates.resumeScore,
    })
    .from(candidates)
    .where(eq(candidates.id, args.candidateId))
    .limit(1)

  if (!cand) {
    return { paused: false, alreadyPaused: false, notificationSent: false, telegramSent: false }
  }

  // Уже в терминальной стадии — паузить нечего (HR уже принял решение).
  if (cand.stage === "rejected" || cand.stage === "hired") {
    return { paused: false, alreadyPaused: true, notificationSent: false, telegramSent: false }
  }

  const alreadyPaused = cand.automationPaused === true || cand.autoProcessingStopped === true

  if (!alreadyPaused) {
    const fromStage = cand.stage ?? "unknown"
    const nowIso = new Date().toISOString()
    const entry: StageHistoryEntry = { from: fromStage, to: fromStage, at: nowIso, reason }

    // Атомарный jsonb-конкат — тот же паттерн, что и в scan-incoming.ts
    // appendStageHistory (SELECT+UPDATE теряет запись при гонке).
    await db.execute(sql`
      UPDATE candidates
      SET
        automation_paused              = true,
        auto_processing_stopped        = true,
        auto_processing_stopped_reason = ${reason},
        auto_processing_stopped_at     = now(),
        stage_history = COALESCE(stage_history, '[]'::jsonb) || ${JSON.stringify(entry)}::jsonb,
        updated_at = now()
      WHERE id = ${args.candidateId}::uuid
    `)

    // Отменяем ВСЕ pending-касания этого кандидата — и legacy-цепочку, и
    // funnelv2:* branch (обе ветки хранятся в одной таблице follow_up_messages
    // с одним candidateId).
    await db.update(followUpMessages).set({
      status:       "cancelled",
      errorMessage: reason,
    }).where(and(
      eq(followUpMessages.candidateId, args.candidateId),
      eq(followUpMessages.status, "pending"),
    ))
  }

  // Эскалация HR — только на первый триггер (иначе HR получит алерт на
  // каждое сообщение кандидата после паузы, включая повторы).
  let notificationSent = false
  let telegramSent = false
  if (!alreadyPaused) {
    const [vac] = await db
      .select({ title: vacancies.title, companyId: vacancies.companyId })
      .from(vacancies)
      .where(eq(vacancies.id, args.vacancyId))
      .limit(1)

    const candName = cand.name || "Кандидат"
    const tokenForUrl = cand.shortId ?? cand.token ?? args.candidateId
    const href = `/hr/vacancies/${args.vacancyId}?tab=candidates&candidate=${tokenForUrl}`
    const preview = args.incomingText.length > 200
      ? args.incomingText.slice(0, 200) + "…"
      : args.incomingText
    const scoreLine = cand.resumeScore != null ? `\nПортрет: ${cand.resumeScore}` : ""
    const confLine = typeof args.confidence === "number" ? `\nУверенность AI: ${args.confidence.toFixed(2)}` : ""
    const title = `⏸️ Дожим на паузе: ${candName} (${vac?.title ?? "вакансия"})`
    const body = `Кандидат ответил отказом от требования вакансии — дожимы остановлены до решения HR.${scoreLine}${confLine}\nСообщение: «${preview}»`

    if (vac?.companyId) {
      await createNotification({
        tenantId:   vac.companyId,
        type:       "followup_paused_needs_review",
        title,
        body,
        severity:   "warning",
        href,
        sourceType: "candidate",
        sourceId:   args.candidateId,
      })
      notificationSent = true

      const baseUrl = getAppBaseUrl()
      const tgText =
        `⏸️ <b>Дожим на паузе — нужен ручной разбор</b>\n\n` +
        `<b>Вакансия:</b> ${vac.title ?? ""}\n` +
        `<b>Кандидат:</b> ${candName}\n` +
        (cand.resumeScore != null ? `<b>Портрет:</b> ${cand.resumeScore}\n` : "") +
        `<b>Сообщение:</b> «${preview}»\n\n` +
        `<a href="${baseUrl}${href}">Открыть карточку</a>`
      const tgResult = await sendToCompanyChannel(vac.companyId, tgText).catch(() => ({ ok: false }))
      telegramSent = tgResult.ok === true
    }
  }

  return { paused: !alreadyPaused, alreadyPaused, notificationSent, telegramSent }
}
