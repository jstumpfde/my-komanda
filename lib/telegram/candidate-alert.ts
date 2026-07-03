/**
 * lib/telegram/candidate-alert.ts
 *
 * Задача Юрия 04.07: «Присылать подходящих кандидатов в Telegram-бот компании».
 * Читает per-vacancy Spec (spec.tgCandidateAlerts), гейтится enabled + порогами
 * триггера, шлёт карточку кандидата в канал компании через sendToCompanyChannel.
 *
 * ДЕДУП: отдельного маркера «уже отправляли» НЕ заводим — в candidates нет
 * общего jsonb-поля для меток, а заводить под это отдельную колонку/таблицу
 * ради двух bool-триггеров избыточно. Вместо этого используем то, что оба
 * триггера в вызывающем коде УЖЕ одноразовые сами по себе:
 *   - "resume_scored" — process-queue вызывает эту точку РОВНО там, где
 *     resume_score выставляется первый раз (guard resumeScore == null перед
 *     записью); повторный проход по тому же кандидату туда не попадёт.
 *   - "gate_passed" — answer-route вызывает эту точку только при
 *     inviteResult.scheduled === true (сам maybeScheduleSecondDemoInvite
 *     идемпотентен: already_invited/already_scheduled НЕ дают scheduled=true
 *     повторно) — т.е. «сработало» только в момент первого планирования.
 * Если в будущем появится общий jsonb на candidates — дедуп стоит перенести
 * туда явной меткой; пока это не нужно, т.к. вызывающие точки одноразовые.
 */

import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies } from "@/lib/db/schema"
import { getSpec } from "@/lib/core/spec/store"
import { sendToCompanyChannel } from "@/lib/telegram/send-to-company"
import { getAppBaseUrl } from "@/lib/funnel-v2/base-url"

export type CandidateAlertTrigger = "resume_scored" | "gate_passed"

export interface MaybeSendCandidateAlertParams {
  candidateId: string
  vacancyId:   string
  trigger:     CandidateAlertTrigger
  /** Балл, относящийся к триггеру: resume_score для "resume_scored",
   *  demo_answers_score для "gate_passed". Опционально — если не передан,
   *  читаем из БД сами. */
  score?:      number | null
}

function formatSalary(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null
  if (min != null && max != null) return `от ${min} до ${max} ₽`
  if (min != null) return `от ${min} ₽`
  return `до ${max} ₽`
}

export async function maybeSendCandidateAlert(params: MaybeSendCandidateAlertParams): Promise<void> {
  const { candidateId, vacancyId, trigger } = params

  const spec = await getSpec(vacancyId)
  const cfg = spec?.tgCandidateAlerts
  if (!cfg?.enabled) return

  if (trigger === "gate_passed" && cfg.onGatePassed !== true) return

  const [row] = await db
    .select({
      name:             candidates.name,
      city:             candidates.city,
      salaryMin:        candidates.salaryMin,
      salaryMax:        candidates.salaryMax,
      resumeScore:      candidates.resumeScore,
      demoAnswersScore: candidates.demoAnswersScore,
      shortId:          candidates.shortId,
      id:               candidates.id,
    })
    .from(candidates)
    .where(eq(candidates.id, candidateId))
    .limit(1)
  if (!row) return

  const resumeScore  = trigger === "resume_scored" ? (params.score ?? row.resumeScore) : row.resumeScore
  const answersScore = trigger === "gate_passed" ? (params.score ?? row.demoAnswersScore) : row.demoAnswersScore

  // Пороги гейтят СВОЙ триггер: резюме-порог проверяем на resume_scored,
  // порог ответов — на gate_passed. Не заданный порог (null) не блокирует.
  if (trigger === "resume_scored" && cfg.minResumeScore != null) {
    if (resumeScore == null || resumeScore < cfg.minResumeScore) return
  }
  if (trigger === "gate_passed" && cfg.minAnswersScore != null) {
    if (answersScore == null || answersScore < cfg.minAnswersScore) return
  }

  const [vac] = await db
    .select({ id: vacancies.id, title: vacancies.title, companyId: vacancies.companyId })
    .from(vacancies)
    .where(eq(vacancies.id, vacancyId))
    .limit(1)
  if (!vac?.companyId) return

  const lines: string[] = ["🎯 Подходящий кандидат: " + (row.name || "без имени")]
  lines.push(`Вакансия: ${vac.title}`)

  const scoreParts: string[] = []
  if (resumeScore != null) scoreParts.push(`AI-резюме: ${resumeScore}`)
  if (answersScore != null) scoreParts.push(`Ответы: ${answersScore}`)
  if (scoreParts.length > 0) lines.push(scoreParts.join(" · "))

  const infoParts: string[] = []
  if (row.city) infoParts.push(`Город: ${row.city}`)
  const salary = formatSalary(row.salaryMin, row.salaryMax)
  if (salary) infoParts.push(`Зарплата: ${salary}`)
  if (infoParts.length > 0) lines.push(infoParts.join(" · "))

  const baseUrl = getAppBaseUrl()
  lines.push(`${baseUrl}/hr/vacancies/${vacancyId}?tab=candidates&candidate=${row.id}`)

  await sendToCompanyChannel(vac.companyId, lines.join("\n")).catch((err: unknown) => {
    console.warn("[candidate-alert] sendToCompanyChannel failed:", err)
  })
}
