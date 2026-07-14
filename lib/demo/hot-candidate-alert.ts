/**
 * lib/demo/hot-candidate-alert.ts
 *
 * Батч «конверсия демо» (координатор+Юрий, 05.07): «горячий кандидат стынет» —
 * кандидат с высоким баллом Портрета открыл демо и не начал его проходить.
 * Уведомляет HR через существующие каналы (in-app notifications + Telegram
 * канал компании) — переиспользует lib/notifications.ts и
 * lib/telegram/send-to-company.ts (тот же паттерн, что lib/telegram/candidate-alert.ts).
 *
 * ДЕДУП: маркер demo_progress_json.hotAlertSentAt (ISO-строка) — один алерт на
 * кандидата. Ставится ПОСЛЕ успешной попытки отправки (даже если Telegram не
 * настроен — in-app всё равно создаётся, повторно спамить не нужно).
 *
 * Гейт: spec.hotCandidateAlert.enabled (дефолт ВЫКЛ — legacy-инвариант).
 */

import { eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies } from "@/lib/db/schema"
import { getSpec } from "@/lib/core/spec/store"
import { createNotification } from "@/lib/notifications"
import { sendToCompanyChannel } from "@/lib/telegram/send-to-company"
import { getAppBaseUrl } from "@/lib/funnel-v2/base-url"
import { shouldSendHotCandidateAlert, type DemoProgressForTrigger } from "@/lib/demo/hot-candidate-trigger"
import { PLATFORM_DEFAULT_HOT_CANDIDATE_THRESHOLD } from "@/lib/core/spec/types"

export interface HotCandidateScanResult {
  vacanciesScanned:  number
  vacanciesEligible: number
  candidatesChecked: number
  alertsSent:        number
}

/** Кандидат, годный для оценки триггером — минимальный набор полей из cron-запроса. */
interface CandidateRow {
  id:               string
  vacancyId:        string
  name:             string
  phone:            string | null
  email:            string | null
  resumeScore:      number | null
  demoOpenedAt:      Date | null
  demoProgressJson: DemoProgressForTrigger | null
  anketaAnswers:    unknown
}

function formatPreferredContact(row: Pick<CandidateRow, "phone" | "email">): string | null {
  if (row.phone) return `Телефон: ${row.phone}`
  if (row.email) return `Email: ${row.email}`
  return null
}

async function markAlertSent(candidateId: string, prevProgress: DemoProgressForTrigger | null): Promise<void> {
  const next = { ...(prevProgress ?? {}), hotAlertSentAt: new Date().toISOString() }
  await db.update(candidates).set({ demoProgressJson: next }).where(eq(candidates.id, candidateId))
}

async function sendAlertForCandidate(row: CandidateRow, vacancyTitle: string, companyId: string, threshold: number): Promise<void> {
  const baseUrl = getAppBaseUrl()
  const href = `/hr/vacancies/${row.vacancyId}?tab=candidates&candidate=${row.id}`
  const contact = formatPreferredContact(row)

  const bodyParts = [`Балл Портрета: ${row.resumeScore}`]
  if (contact) bodyParts.push(contact)

  // In-app уведомление всем HR компании (userId=null — существующая семантика
  // notifications.userId, см. lib/notifications.ts).
  await createNotification({
    tenantId:   companyId,
    type:       "hot_candidate_alert",
    title:      `🔥 Сильный кандидат стынет: ${row.name || "без имени"}`,
    body:       `Вакансия: ${vacancyTitle}. Открыл демо и не начал — стоит связаться лично. ${bodyParts.join(" · ")}`,
    severity:   "warning",
    sourceType: "candidate",
    sourceId:   row.id,
    href,
  })

  // Telegram-канал компании — тот же транспорт, что и tgCandidateAlerts.
  const lines: string[] = [
    `🔥 Сильный кандидат (Портрет ${row.resumeScore}) открыл демо и не начал — стоит связаться лично`,
    `Кандидат: ${row.name || "без имени"}`,
    `Вакансия: ${vacancyTitle}`,
  ]
  if (contact) lines.push(contact)
  lines.push(`${baseUrl}${href}`)

  await sendToCompanyChannel(companyId, lines.join("\n")).catch((err: unknown) => {
    console.warn("[hot-candidate-alert] sendToCompanyChannel failed:", err)
  })

  await markAlertSent(row.id, row.demoProgressJson)
}

/**
 * Сканирует кандидатов с открытым демо и без прогресса на вакансиях, где
 * включён hotCandidateAlert. Для каждого прошедшего триггер — шлёт алерт.
 * Возвращает счётчики для лога cron_runs.
 */
export async function scanHotCandidates(): Promise<HotCandidateScanResult> {
  const result: HotCandidateScanResult = {
    vacanciesScanned: 0,
    vacanciesEligible: 0,
    candidatesChecked: 0,
    alertsSent: 0,
  }

  // Кандидаты-кандидаты на алерт — сузим выборку в SQL до тех, у кого demo
  // открыто, но 0 реальных блоков не проверить SQL-ом (jsonb-логика в
  // hot-candidate-trigger), поэтому берём широкий фильтр по колонкам
  // (demo_opened_at задан, anketa_answers пуст/NULL, resume_score задан) и
  // дожимаем точную логику в JS. Ограничиваем окно 14 днями — старше уже
  // почти наверняка что-то произошло (отказ/найм), не тащим весь массив.
  const rows = (await db.execute(sql`
    SELECT
      c.id                 AS id,
      c.vacancy_id         AS vacancy_id,
      c.name               AS name,
      c.phone              AS phone,
      c.email              AS email,
      c.resume_score       AS resume_score,
      c.demo_opened_at     AS demo_opened_at,
      c.demo_progress_json AS demo_progress_json,
      c.anketa_answers     AS anketa_answers,
      v.title              AS vacancy_title,
      v.company_id         AS company_id
    FROM candidates c
    JOIN vacancies v ON v.id = c.vacancy_id
    WHERE c.demo_opened_at IS NOT NULL
      AND c.demo_opened_at > NOW() - INTERVAL '14 days'
      AND c.resume_score IS NOT NULL
      AND c.stage NOT IN ('rejected', 'hired')
      AND (c.demo_progress_json IS NULL OR (c.demo_progress_json ->> 'hotAlertSentAt') IS NULL)
    ORDER BY c.demo_opened_at ASC
    LIMIT 500
  `)) as unknown as Array<{
    id: string
    vacancy_id: string
    name: string
    phone: string | null
    email: string | null
    resume_score: number | null
    demo_opened_at: Date | string | null
    demo_progress_json: DemoProgressForTrigger | null
    anketa_answers: unknown
    vacancy_title: string
    company_id: string
  }>

  const vacancyIdsSeen = new Set<string>()
  const specCache = new Map<string, { enabled: boolean; threshold: number; staleAfterHours: number }>()

  for (const raw of rows) {
    result.candidatesChecked++
    vacancyIdsSeen.add(raw.vacancy_id)

    let cfg = specCache.get(raw.vacancy_id)
    if (!cfg) {
      const spec = await getSpec(raw.vacancy_id)
      // При включённом движке v2 берём «горячего кандидата» из
      // funnelV2.communications.hotCandidate (перенос из Портрета 14.07).
      const { resolveHotCandidate } = await import("@/lib/funnel-v2/native-config")
      const { normalizeFunnelV2 } = await import("@/lib/funnel-v2/types")
      const [vacRow] = await db
        .select({ runtimeEnabled: vacancies.funnelV2RuntimeEnabled, descriptionJson: vacancies.descriptionJson })
        .from(vacancies)
        .where(eq(vacancies.id, raw.vacancy_id))
        .limit(1)
      const hot = resolveHotCandidate(
        (spec?.hotCandidateAlert ?? null) as Record<string, unknown> | null,
        normalizeFunnelV2((vacRow?.descriptionJson as Record<string, unknown> | null)?.funnelV2),
        vacRow?.runtimeEnabled === true,
      )
      cfg = {
        enabled: hot?.enabled === true,
        threshold: hot?.threshold ?? PLATFORM_DEFAULT_HOT_CANDIDATE_THRESHOLD,
        staleAfterHours: hot?.staleAfterHours ?? 3,
      }
      specCache.set(raw.vacancy_id, cfg)
      if (cfg.enabled) result.vacanciesEligible++
    }
    if (!cfg.enabled) continue

    const trigger = shouldSendHotCandidateAlert({
      resumeScore: raw.resume_score,
      threshold: cfg.threshold,
      demoOpenedAt: raw.demo_opened_at,
      staleAfterHours: cfg.staleAfterHours,
      demoProgressJson: raw.demo_progress_json,
      anketaAnswers: raw.anketa_answers,
    })
    if (!trigger) continue

    await sendAlertForCandidate(
      {
        id: raw.id,
        vacancyId: raw.vacancy_id,
        name: raw.name,
        phone: raw.phone,
        email: raw.email,
        resumeScore: raw.resume_score,
        demoOpenedAt: raw.demo_opened_at ? new Date(raw.demo_opened_at) : null,
        demoProgressJson: raw.demo_progress_json,
        anketaAnswers: raw.anketa_answers,
      },
      raw.vacancy_title,
      raw.company_id,
      cfg.threshold,
    )
    result.alertsSent++
  }

  result.vacanciesScanned = vacancyIdsSeen.size
  return result
}
