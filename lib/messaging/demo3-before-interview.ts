/**
 * Мягкое напоминание «пройдите Демо-3 до интервью» (форвард-механизм, 14.07).
 *
 * Проблема: 14 кандидатов, bulk-переведённых в interview НЕ пройдя финальное
 * демо, получали противоречие (и «запишись на интервью», и «пройди Демо-3»).
 * Решение владельца (после смены курса): НЕ блокировать запись на интервью —
 * а мягко направлять. Когда кандидат записался на интервью (бронь) ИЛИ переведён
 * в стадию interview, но НЕ прошёл ПОСЛЕДНИЙ демо-блок вакансии — ставим ОДНО
 * напоминание с ссылкой на этот блок. Дедуп: одно на кандидата (не спамим).
 *
 * Канал — hh-чат через очередь follow_up_messages (branch='demo3_before_interview'),
 * как schedule_invite / second_demo_invite / demo3_invite. Cron /api/cron/follow-up
 * обрабатывает ветку как одноразовое транзакционное касание (isOneOffPostAnketa):
 * без стоп-триггеров дожима и дневного rate-limit; окно отправки — категория
 * 'invite' (lib/messaging/touch-window.ts). Ссылку /demo/<token>?block=<demo3 id>
 * подставляем здесь при создании строки (как scripts/send-demo3-invite.ts);
 * штатные {{name}}/{{vacancy}}/… рендерит cron.
 *
 * ГЕЙТ (иначе ничего не делаем — поведение прежнее):
 *   - у вакансии > 1 демо-блока (иначе «Демо-3» нет);
 *   - последний демо-блок СКОРИРУЕМ (в нём есть task-вопросы) — иначе ключа в
 *     demo_block_scores не бывает ни у кого, и мы бы слали напоминание всем;
 *   - кандидат его НЕ прошёл (нет ключа последнего блока в demo_block_scores).
 *
 * Демо-блоки и их порядок (Д1, Д2, Д3, ...) — тот же источник, что и во всех
 * пер-блочных подсчётах: demos с kind='demo'/'block:%', сортировка sortOrder,
 * createdAt (совпадает с порядком записи ключей в demo_block_scores,
 * см. lib/demo/score-answers.ts). Последний = наивысший индекс = «Демо-3».
 *
 * Чистое решение (decideDemo3BeforeInterview) — без БД, юнит-тестируется.
 * Эффект (maybeScheduleDemo3BeforeInterview) — с идемпотентностью, dry-run и логами.
 */

import { eq, and, or, like, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  candidates,
  demos,
  followUpCampaigns,
  followUpMessages,
  vacancies,
} from "@/lib/db/schema"
import { getAppBaseUrl } from "@/lib/funnel-v2/base-url"
import { adjustToWorkingWindow, type VacancySchedule } from "@/lib/schedule/can-send-now"
import { decideDemo3BeforeInterview } from "@/lib/messaging/demo3-gate"

// Чистый гейт (без БД) — в отдельном модуле, юнит-тестируется.
export { decideDemo3BeforeInterview } from "@/lib/messaging/demo3-gate"
export type { Demo3GateInput, Demo3GateDecision } from "@/lib/messaging/demo3-gate"

export const DEMO3_BEFORE_INTERVIEW_BRANCH = "demo3_before_interview"

export const DEMO3_LINK_PLACEHOLDER = "{{demo3_link}}"

/** Дефолтный текст напоминания. Мягкий (формулировка владельца 14.07). */
export const DEFAULT_DEMO3_BEFORE_INTERVIEW_TEXT =
  "{{name}}, пожалуйста, пройдите Демо-3 до интервью — это очень важно: {{demo3_link}}"

/** Гарантирует наличие follow_up_campaigns строки (campaign_id NOT NULL). */
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

export interface Demo3ReminderResult {
  scheduled: boolean
  reason?: string
  demo3Id?: string
}

/**
 * Ставит в очередь ОДНО мягкое напоминание про Демо-3 перед интервью, если
 * гейт (decideDemo3BeforeInterview) сработал и напоминание ещё не стоит.
 *
 * @param dryRun — не пишет в БД, только считает решение (для скрипта/диагностики).
 */
export async function maybeScheduleDemo3BeforeInterview(args: {
  candidateId: string
  vacancyId:   string
  dryRun?:     boolean
}): Promise<Demo3ReminderResult> {
  try {
    // 1. Демо-блоки вакансии в каноническом порядке (тот же фильтр/сортировка,
    //    что пишут demo_block_scores — lib/demo/score-answers.ts).
    const demoRows = await db
      .select({ id: demos.id, title: demos.title, lessonsJson: demos.lessonsJson })
      .from(demos)
      .where(and(
        eq(demos.vacancyId, args.vacancyId),
        or(eq(demos.kind, "demo"), like(demos.kind, "block:%")),
      ))
      .orderBy(demos.sortOrder, demos.createdAt)

    // 2. Кандидат: баллы блоков + токен для ссылки + защитные поля стадии.
    const [cand] = await db
      .select({
        demoBlockScores:       candidates.demoBlockScores,
        token:                 candidates.token,
        shortId:               candidates.shortId,
        stage:                 candidates.stage,
        autoProcessingStopped: candidates.autoProcessingStopped,
        automationPaused:      candidates.automationPaused,
      })
      .from(candidates)
      .where(and(eq(candidates.id, args.candidateId), eq(candidates.vacancyId, args.vacancyId)))
      .limit(1)
    if (!cand) return { scheduled: false, reason: "candidate_not_found" }

    // Не беспокоим отклонённых/нанятых и тех, кто попросил остановить автоматику.
    if (cand.stage === "rejected" || cand.stage === "hired" || cand.autoProcessingStopped || cand.automationPaused) {
      return { scheduled: false, reason: "stage_terminal" }
    }

    // 3. Гейт (чистая функция).
    const decision = decideDemo3BeforeInterview({
      demoRows,
      demoBlockScores: cand.demoBlockScores as Record<string, { score?: number }> | null,
    })
    if (!decision.shouldRemind || !decision.demo3Id) {
      return { scheduled: false, reason: decision.reason }
    }

    // 4. Дедуп: одно напоминание на кандидата (не спамим). Считаем и активные, и
    //    уже отправленные/приостановленные — повтор не создаём.
    const [existing] = await db
      .select({ id: followUpMessages.id })
      .from(followUpMessages)
      .where(and(
        eq(followUpMessages.candidateId, args.candidateId),
        eq(followUpMessages.branch, DEMO3_BEFORE_INTERVIEW_BRANCH),
        inArray(followUpMessages.status, ["pending", "sending", "sent", "held"]),
      ))
      .limit(1)
    if (existing) return { scheduled: false, reason: "already_scheduled", demo3Id: decision.demo3Id }

    // 5. Текст (настраиваемый per-вакансия) + расписание отправки.
    const [vac] = await db
      .select({
        demo3Text:                  vacancies.demo3BeforeInterviewText,
        scheduleEnabled:            vacancies.scheduleEnabled,
        scheduleStart:              vacancies.scheduleStart,
        scheduleEnd:                vacancies.scheduleEnd,
        scheduleTimezone:           vacancies.scheduleTimezone,
        scheduleWorkingDays:        vacancies.scheduleWorkingDays,
        scheduleExcludedHolidayIds: vacancies.scheduleExcludedHolidayIds,
        scheduleCustomHolidays:     vacancies.scheduleCustomHolidays,
        scheduleLunchEnabled:       vacancies.scheduleLunchEnabled,
        scheduleLunchFrom:          vacancies.scheduleLunchFrom,
        scheduleLunchTo:            vacancies.scheduleLunchTo,
        scheduleCountry:            vacancies.scheduleCountry,
      })
      .from(vacancies)
      .where(eq(vacancies.id, args.vacancyId))
      .limit(1)
    if (!vac) return { scheduled: false, reason: "vacancy_not_found" }

    // Ссылка на последний демо-блок: длинный token (не short_id — тот ловит
    // реферальный редирект в /demo/[token], уводя на первое демо), ?block=<id>.
    const tokenForUrl = cand.token ?? cand.shortId ?? args.candidateId
    const link = `${getAppBaseUrl()}/demo/${tokenForUrl}?block=${decision.demo3Id}`

    const textRaw = (typeof vac.demo3Text === "string" && vac.demo3Text.trim().length > 0)
      ? vac.demo3Text.trim()
      : DEFAULT_DEMO3_BEFORE_INTERVIEW_TEXT
    // Гарантия ссылки: без {{demo3_link}} кандидат не смог бы открыть Демо-3 —
    // дописываем в конец.
    const textWithLink = textRaw.includes(DEMO3_LINK_PLACEHOLDER)
      ? textRaw
      : `${textRaw.trimEnd()}\n\n${DEMO3_LINK_PLACEHOLDER}`
    // Подставляем ссылку здесь (как send-demo3-invite); {{name}}/{{vacancy}}/… — cron.
    const messageText = textWithLink.split(DEMO3_LINK_PLACEHOLDER).join(link)

    if (args.dryRun) {
      return { scheduled: false, reason: "dry_run", demo3Id: decision.demo3Id }
    }

    // 6. Кампания (FK) + окно отправки.
    const campaignId = await ensureCampaign(args.vacancyId)
    if (!campaignId) return { scheduled: false, reason: "campaign_upsert_failed" }

    const vacancySchedule: VacancySchedule = {
      scheduleEnabled:            vac.scheduleEnabled,
      scheduleStart:              vac.scheduleStart,
      scheduleEnd:                vac.scheduleEnd,
      scheduleTimezone:           vac.scheduleTimezone,
      scheduleWorkingDays:        vac.scheduleWorkingDays,
      scheduleExcludedHolidayIds: vac.scheduleExcludedHolidayIds,
      scheduleCustomHolidays:     vac.scheduleCustomHolidays as { from: string; to: string; label: string }[] | null,
      scheduleLunchEnabled:       vac.scheduleLunchEnabled,
      scheduleLunchFrom:          vac.scheduleLunchFrom,
      scheduleLunchTo:            vac.scheduleLunchTo,
      scheduleCountry:            vac.scheduleCountry,
    }
    const { adjusted } = adjustToWorkingWindow(new Date(), vacancySchedule)

    await db.insert(followUpMessages).values({
      campaignId,
      candidateId: args.candidateId,
      scheduledAt: adjusted,
      touchNumber: 0,
      channel:     "hh",
      messageText,
      status:      "pending",
      branch:      DEMO3_BEFORE_INTERVIEW_BRANCH,
    })

    console.log("[demo3-before-interview]", JSON.stringify({
      tag:         "demo3-before-interview/schedule",
      candidateId: args.candidateId,
      vacancyId:   args.vacancyId,
      demo3Id:     decision.demo3Id,
      scheduledAt: adjusted.toISOString(),
    }))

    return { scheduled: true, demo3Id: decision.demo3Id }
  } catch (err) {
    console.error("[demo3-before-interview] schedule failed:", err instanceof Error ? err.message : err)
    return { scheduled: false, reason: "exception" }
  }
}
