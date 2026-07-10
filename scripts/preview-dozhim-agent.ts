/**
 * scripts/preview-dozhim-agent.ts
 *
 * Сухой прогон пилота «агента коммуникаций» (Юрий 10.07,
 * lib/comms-agent/adapt-followup-message.ts) — берёт несколько РЕАЛЬНЫХ
 * pending-касаний дожима вакансии, считает буквальный текст (как сейчас,
 * без изменений) и AI-адаптацию, печатает оба рядом. НИЧЕГО НЕ ОТПРАВЛЯЕТ
 * кандидатам и НЕ меняет статус follow_up_messages — только для ревью.
 *
 * Запуск (на сервере, из /var/www/my-komanda):
 *   pnpm exec tsx --env-file=.env --env-file=.env.local scripts/preview-dozhim-agent.ts \
 *     --vacancy=<uuid> --limit=5
 *
 * ВАЖНО: --env-file=.env ОБЯЗАТЕЛЕН (не только .env.local) — CLAUDE_PROXY_URL
 * лежит в .env, без него AI-вызов уходит напрямую на api.anthropic.com и
 * ловит 403 с прод-сервера (Anthropic блокирует RU), см. memory
 * claude-proxy-riga-vps. Найдено и исправлено 10.07 при первом прогоне.
 *
 * Требует env: DATABASE_URL, ANTHROPIC_API_KEY, CLAUDE_PROXY_URL(S).
 */

import { eq, and } from "drizzle-orm"
import { db, pgClient } from "@/lib/db"
import { candidates, vacancies, companies, users, followUpMessages, followUpCampaigns } from "@/lib/db/schema"
import { renderTemplate } from "@/lib/template-renderer"
import { getCandidateFirstName } from "@/lib/messaging/candidate-name"
import { getAppBaseUrl } from "@/lib/funnel-v2/base-url"
import { adaptFollowupMessage } from "@/lib/comms-agent/adapt-followup-message"

function parseArgs(argv: string[]) {
  const args = argv.slice(2)
  let vacancyId = ""
  let limit = 5
  for (const a of args) {
    if (a.startsWith("--vacancy=")) vacancyId = a.slice("--vacancy=".length).trim()
    if (a.startsWith("--limit=")) limit = Math.max(1, parseInt(a.slice("--limit=".length), 10) || 5)
  }
  return { vacancyId, limit }
}

async function main() {
  const { vacancyId, limit } = parseArgs(process.argv)
  if (!vacancyId) {
    console.log("Использование: tsx scripts/preview-dozhim-agent.ts --vacancy=<uuid> [--limit=5]")
    process.exit(1)
  }

  const [vacancy] = await db
    .select({ id: vacancies.id, title: vacancies.title, companyId: vacancies.companyId, createdBy: vacancies.createdBy })
    .from(vacancies)
    .where(eq(vacancies.id, vacancyId))
    .limit(1)
  if (!vacancy) { console.error("Вакансия не найдена"); process.exit(1) }

  const [companyRow] = await db.select({ name: companies.name }).from(companies).where(eq(companies.id, vacancy.companyId)).limit(1)
  const companyName = companyRow?.name?.trim() || "Company24"

  let managerName = ""
  if (vacancy.createdBy) {
    const [mgr] = await db.select({ firstName: users.firstName, name: users.name }).from(users).where(eq(users.id, vacancy.createdBy)).limit(1)
    managerName = mgr?.firstName?.trim() || mgr?.name?.trim() || ""
  }

  const campaignIds = await db
    .select({ id: followUpCampaigns.id })
    .from(followUpCampaigns)
    .where(eq(followUpCampaigns.vacancyId, vacancyId))
  if (!campaignIds.length) { console.log("У вакансии нет кампании дожима — нечего показать."); process.exit(0) }

  const pending = await db
    .select()
    .from(followUpMessages)
    .where(and(eq(followUpMessages.campaignId, campaignIds[0].id), eq(followUpMessages.status, "pending")))
    .limit(limit)

  if (!pending.length) { console.log("Нет pending-касаний для этой вакансии."); process.exit(0) }

  console.log(`Вакансия: ${vacancy.title}\nНайдено pending-касаний: ${pending.length} (показываю до ${limit})\n${"=".repeat(60)}`)

  for (const msg of pending) {
    const [cand] = await db.select({ shortId: candidates.shortId, token: candidates.token }).from(candidates).where(eq(candidates.id, msg.candidateId)).limit(1)
    const { firstName } = await getCandidateFirstName(msg.candidateId)
    const tokenForUrl = cand?.shortId ?? cand?.token ?? msg.candidateId
    const literalText = renderTemplate(msg.messageText, {
      name:          firstName,
      vacancy:       vacancy.title || "",
      company:       companyName,
      manager:       managerName,
      demo_link:     `${getAppBaseUrl()}/demo/${tokenForUrl}`,
      test_link:     `${getAppBaseUrl()}/test/${tokenForUrl}`,
      schedule_link: `${getAppBaseUrl()}/schedule/${tokenForUrl}`,
    })

    const adapted = await adaptFollowupMessage({
      guardrailText: literalText,
      candidateName: firstName,
      vacancyTitle:  vacancy.title || "",
      branch:        msg.branch,
      touchNumber:   msg.touchNumber,
      progressHint:  "",
      vacancyId:     vacancy.id,
      companyId:     vacancy.companyId,
    })

    console.log(`\n--- Кандидат ${msg.candidateId} · ветка=${msg.branch} · касание №${msg.touchNumber} ---`)
    console.log(`[СЕЙЧАС отправилось бы]:\n${literalText}`)
    console.log(`\n[АГЕНТ, safe=${adapted.safe}${adapted.reason ? ` reason=${adapted.reason}` : ""}]:\n${adapted.text}`)
    console.log("-".repeat(60))
  }
}

main()
  .then(async () => { await pgClient.end({ timeout: 5 }); process.exit(0) })
  .catch(async (err) => {
    console.error("[preview-dozhim-agent] ФАТАЛЬНАЯ ОШИБКА:", err instanceof Error ? err.message : err)
    await pgClient.end({ timeout: 5 }).catch(() => {})
    process.exit(1)
  })
