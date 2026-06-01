// Мини-фича рассылки теста (01.06.2026).
//
// HR выбирает кандидатов (вручную в списке или из воронки) → каждому ставится
// в очередь приглашение пройти тест. ОТПРАВКА идёт через тот же cron
// /api/cron/follow-up (branch='test_invite'), поэтому:
//   • рассылка НЕ мгновенная, а по очереди — cron шлёт по одному с паузой
//     resolveCompanyDelayMs («не чаще, чем указано в настройках компании»);
//   • текст рендерится с персональной ссылкой {{test_link}} → /test/{token}
//     (у каждого кандидата своя, см. app/api/public/test/[token]);
//   • test_invite в обходе стоп-триггеров (это явное действие HR, не дожим).
//
// При постановке в очередь стадия кандидата переводится в test_task_sent
// (если он ещё не дальше по воронке) — это и останавливает дожим
// (test-стадии добавлены в ADVANCED_STAGES, lib/followup/should-stop.ts).
//
// Дедупликация по (candidate_id, branch='test_invite', status pending|sent):
// повторная отправка тому же кандидату не плодит дублей, пока предыдущее
// приглашение не доставлено/не упало.

import { eq, and, inArray, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  demos,
  candidates,
  followUpCampaigns,
  followUpMessages,
  hhResponses,
  vacancies,
  type PostDemoSettings,
} from "@/lib/db/schema"
import { adjustToWorkingWindow } from "@/lib/schedule/can-send-now"

export const DEFAULT_TEST_INVITE_TEXT =
  "{{name}}, спасибо за интерес к вакансии «{{vacancy}}»! Предлагаем пройти короткий тест — пройдите по ссылке:\n\n{{test_link}}"
const DEFAULT_TEXT = DEFAULT_TEST_INVITE_TEXT

// Тест-дожим: дефолтное расписание (Д+N от отправки теста) и тексты напоминаний.
// Плейсхолдеры рендерит cron (follow-up): {{name}}/{{vacancy}}/{{test_link}}.
export const DEFAULT_TEST_REMINDER_DAYS: number[] = [1, 3, 6]
export const DEFAULT_TEST_REMINDER_MESSAGES: string[] = [
  "{{name}}, напоминаем про тест по вакансии «{{vacancy}}» — пройдите, пожалуйста, по ссылке:\n\n{{test_link}}\n\nЭто займёт немного времени.",
  "{{name}}, тест по «{{vacancy}}» ещё ждёт вас 🙂 Ссылка та же:\n\n{{test_link}}\n\nЕсли возникли вопросы — напишите здесь, помогу.",
  "{{name}}, последнее напоминание про тест по «{{vacancy}}». Если позиция интересна — пройдите, пожалуйста:\n\n{{test_link}}",
]

// Стадии, с которых НЕ откатываем назад в test_task_sent: кандидат уже сдал
// тест / прошёл дальше / терминальный. Приглашение всё равно поставим (HR мог
// осознанно переслать), но стадию не трогаем, чтобы не сбить воронку.
const NO_DOWNGRADE = new Set<string>([
  "test_task_done", "test_passed", "test_failed",
  "scheduled", "interview", "interviewed", "reference_check",
  "decision", "final_decision", "offer_sent", "offer", "hired", "rejected",
])

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

export interface SendTestResult {
  ok: boolean
  error?: "no_test" | "campaign_failed" | "no_candidates"
  scheduled: number
  alreadyQueued: number
  skipped: number
  noHhLink: number   // выбраны, но без hh-чата — отправить в hh некуда
  scheduledAt?: string
}

/**
 * Ставит в очередь приглашение пройти тест выбранным кандидатам вакансии.
 * Только чтение конфигурации теста — один раз; рассылку троттлит cron.
 */
export async function scheduleTestInvitesForCandidates(args: {
  vacancyId: string
  candidateIds: string[]
}): Promise<SendTestResult> {
  const result: SendTestResult = { ok: false, scheduled: 0, alreadyQueued: 0, skipped: 0, noHhLink: 0 }
  if (!args.candidateIds.length) return { ...result, error: "no_candidates" }

  // 1. Тест вакансии — запись demos kind='test'. Без неё слать нечего.
  const [testDemo] = await db
    .select({ postDemoSettings: demos.postDemoSettings })
    .from(demos)
    .where(and(eq(demos.vacancyId, args.vacancyId), eq(demos.kind, "test")))
    .orderBy(sql`${demos.updatedAt} DESC`)
    .limit(1)
  if (!testDemo) return { ...result, error: "no_test" }

  const settings = (testDemo.postDemoSettings as PostDemoSettings | null) ?? {}
  const inviteText =
    (settings.testInviteMessage && settings.testInviteMessage.trim().length > 0)
      ? settings.testInviteMessage.trim()
      : DEFAULT_TEXT

  // 2. Параметры расписания вакансии (для рабочего окна) + базовые данные.
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
  if (!vac) return { ...result, error: "no_test" }

  // 3. Кампания (follow_up_messages.campaign_id NOT NULL).
  const campaignId = await ensureCampaign(args.vacancyId)
  if (!campaignId) return { ...result, error: "campaign_failed" }

  // 4. Только кандидаты этой вакансии (guard от чужих id).
  const cands = await db
    .select({ id: candidates.id, stage: candidates.stage })
    .from(candidates)
    .where(and(
      eq(candidates.vacancyId, args.vacancyId),
      inArray(candidates.id, args.candidateIds),
    ))
  if (!cands.length) return { ...result, error: "no_candidates" }
  const stageById = new Map(cands.map(c => [c.id, c.stage ?? "new"]))
  const validIds = cands.map(c => c.id)

  // 5. Дедуп: уже есть pending|sent приглашение.
  const existing = await db
    .select({ candidateId: followUpMessages.candidateId })
    .from(followUpMessages)
    .where(and(
      inArray(followUpMessages.candidateId, validIds),
      eq(followUpMessages.branch, "test_invite"),
      inArray(followUpMessages.status, ["pending", "sent"]),
    ))
  const alreadyQueued = new Set(existing.map(e => e.candidateId))

  // 5b. hh-связка: тест шлётся в hh-чат конкретного отклика. Кандидаты без
  // привязанного hh_response отправить нельзя (no_hh_response_link) — отсеиваем
  // заранее, чтобы не плодить молча упавшие сообщения, и сообщаем HR счётчиком.
  const linkedRows = await db
    .select({ cid: hhResponses.localCandidateId })
    .from(hhResponses)
    .where(inArray(hhResponses.localCandidateId, validIds))
  const linkedSet = new Set(linkedRows.map(r => r.cid).filter((x): x is string => !!x))

  // 6. scheduled_at — один раз: now, сдвинутый в рабочее окно вакансии.
  const nowDate = new Date()
  const vacSchedule = {
    scheduleEnabled:            vac.scheduleEnabled,
    scheduleStart:              vac.scheduleStart,
    scheduleEnd:                vac.scheduleEnd,
    scheduleTimezone:           vac.scheduleTimezone,
    scheduleWorkingDays:        vac.scheduleWorkingDays,
    scheduleExcludedHolidayIds: vac.scheduleExcludedHolidayIds,
    scheduleCustomHolidays:     vac.scheduleCustomHolidays as { from: string; to: string; label: string }[] | null,
  }
  const { adjusted: scheduledAt } = adjustToWorkingWindow(nowDate, vacSchedule)

  // Тест-дожим: напоминания Д+N после отправки теста, пока кандидат не сдал.
  const reminderEnabled = settings.testReminderEnabled === true
  const reminderDays = (Array.isArray(settings.testReminderDays) && settings.testReminderDays.length > 0)
    ? settings.testReminderDays.filter((d) => Number.isFinite(d) && d >= 1 && d <= 365).sort((a, b) => a - b)
    : DEFAULT_TEST_REMINDER_DAYS
  const reminderMessages = (Array.isArray(settings.testReminderMessages) && settings.testReminderMessages.length > 0)
    ? settings.testReminderMessages
    : DEFAULT_TEST_REMINDER_MESSAGES

  for (const id of validIds) {
    if (alreadyQueued.has(id)) { result.alreadyQueued++; continue }
    if (!linkedSet.has(id)) { result.noHhLink++; continue }
    try {
      await db.insert(followUpMessages).values({
        campaignId,
        candidateId: id,
        scheduledAt,
        touchNumber: 0,
        channel:     "hh",
        messageText: inviteText,
        status:      "pending",
        branch:      "test_invite",
      })
      // Тест-дожим: ставим напоминания Д+N (branch='test_reminder'). Cron
      // отправит их в рабочее окно и отменит, как только кандидат сдаст тест
      // (или уйдёт в отказ/найм). Тексты с плейсхолдерами рендерит cron.
      if (reminderEnabled) {
        const reminderTouches = reminderDays.map((dayOffset, idx) => {
          const base = new Date(nowDate.getTime() + dayOffset * 86_400_000)
          const { adjusted } = adjustToWorkingWindow(base, vacSchedule)
          return {
            campaignId,
            candidateId: id,
            scheduledAt: adjusted,
            touchNumber: idx + 1,
            channel:     "hh" as const,
            messageText: reminderMessages[idx] ?? reminderMessages[reminderMessages.length - 1] ?? "",
            status:      "pending" as const,
            branch:      "test_reminder",
          }
        }).filter((t) => t.messageText.trim().length > 0)
        if (reminderTouches.length > 0) await db.insert(followUpMessages).values(reminderTouches)
      }

      // Стадию двигаем только вперёд → «Тест отправлен» в колонке «Статус».
      if (!NO_DOWNGRADE.has(stageById.get(id) ?? "new")) {
        await db.update(candidates)
          .set({ stage: "test_task_sent", updatedAt: new Date() })
          .where(eq(candidates.id, id))
      }
      result.scheduled++
    } catch (err) {
      console.error("[test-invite] insert failed:", id, err instanceof Error ? err.message : err)
      result.skipped++
    }
  }

  console.log("[test-invite]", JSON.stringify({
    tag: "test-invite/schedule", vacancyId: args.vacancyId,
    requested: args.candidateIds.length, scheduled: result.scheduled,
    alreadyQueued: result.alreadyQueued, skipped: result.skipped,
    scheduledAt: scheduledAt.toISOString(),
  }))

  result.ok = true
  result.scheduledAt = scheduledAt.toISOString()
  return result
}
