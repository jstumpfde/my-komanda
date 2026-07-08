/**
 * scripts/hh-clear-response-backlog.ts
 *
 * Одноразовый ops-скрипт (08.07). Юрий: на hh.ru есть 347 откликов в бакете
 * "response" (тот самый счётчик "Все неразобранные" на скриншоте) — их нужно
 * разобрать: если сообщения кандидату ещё не было — отправить приглашение
 * со ссылкой на демо; если уже было (сообщение видно в истории переговоров) —
 * просто перевести стадию hh на "Первичный контакт" (phone_interview) без
 * повторной отправки текста.
 *
 * Источник списка — ТОТ ЖЕ hh-эндпоинт, что у кнопки "Разобрать всё"
 * (/negotiations/response?vacancy_id=...), НЕ наша локальная БД — обходит
 * возможное расхождение между hh_responses.status (once 'invited' —
 * больше не обновляется, см. import-responses.ts CASE-guard) и реальным
 * состоянием на hh.ru.
 *
 * Критерий "уже было сообщение": negotiation.counters.messages > 0.
 * Действие phone_interview шлётся через changeNegotiationState(action=
 * "invitation") — та же функция и маппинг, что trySyncStageToHh использует
 * для приглашения (lib/hh/sync-stage.ts) — это НЕ "consider".
 *
 * По умолчанию --dry-run. --send — применяет реально. Троттлинг: пачки по 3,
 * пауза между пачками — не жечь hh API rate-limit.
 *
 * Запуск (на сервере, из /var/www/my-komanda):
 *   pnpm exec tsx --env-file=.env scripts/hh-clear-response-backlog.ts --vacancy=<uuid>
 *   pnpm exec tsx --env-file=.env scripts/hh-clear-response-backlog.ts --vacancy=<uuid> --send
 */

import { db } from "../lib/db"
import { candidates, vacancies, hhResponses } from "../lib/db/schema"
import { and, eq, isNull } from "drizzle-orm"
import { getValidToken } from "../lib/hh-helpers"
import { getNegotiations, changeNegotiationState } from "../lib/hh-api"
import { getCandidateFirstName } from "../lib/messaging/candidate-name"
import { renderTemplate } from "../lib/template-renderer"
import { getEffectiveMessageDefaults } from "../lib/messaging/effective-message-defaults"
import { getAppBaseUrl } from "../lib/funnel-v2/base-url"

function arg(name: string): string | undefined {
  const pfx = `--${name}=`
  const found = process.argv.find(a => a.startsWith(pfx))
  return found ? found.slice(pfx.length) : undefined
}
const SEND = process.argv.includes("--send")
const BATCH = 3

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function main() {
  const vacancyId = arg("vacancy")
  if (!vacancyId) { console.error("Использование: --vacancy=<uuid> [--send]"); process.exit(1) }

  const [vac] = await db
    .select({
      id: vacancies.id, title: vacancies.title, companyId: vacancies.companyId,
      companyName: vacancies.companyId, hhVacancyId: vacancies.hhVacancyId,
      inviteMessage: vacancies.aiProcessSettings,
    })
    .from(vacancies)
    .where(eq(vacancies.id, vacancyId))
    .limit(1)
  if (!vac?.hhVacancyId) { console.error("Вакансия не найдена или нет hh_vacancy_id"); process.exit(1) }

  console.log(`[backlog] Вакансия "${vac.title}" (${vac.id})${SEND ? " — РЕЖИМ SEND" : " — dry-run"}`)

  const token = await getValidToken(vac.companyId)
  if (!token) { console.error("[backlog] нет валидного hh-токена"); process.exit(1) }

  // ── Шаг 1: собрать все id из бакета "response" (все страницы) ─────────
  const first = await getNegotiations(token.accessToken, { vacancyId: vac.hhVacancyId, page: 0 }) as unknown as {
    items: Array<{ id: string; counters?: { messages?: number } }>
    pages: number
  }
  const totalPages = first.pages ?? 1
  const allItems: Array<{ id: string; counters?: { messages?: number } }> = [...(first.items ?? [])]
  for (let p = 1; p < totalPages; p++) {
    const data = await getNegotiations(token.accessToken, { vacancyId: vac.hhVacancyId, page: p }) as unknown as {
      items: Array<{ id: string; counters?: { messages?: number } }>
    }
    allItems.push(...(data.items ?? []))
    await sleep(300)
  }
  console.log(`[backlog] найдено в бакете "response" на hh.ru: ${allItems.length}`)

  // ── Шаг 2: для каждого — найти локального кандидата (для demo-ссылки) ──
  const withCandidate = await Promise.all(allItems.map(async (item) => {
    const [row] = await db
      .select({ candidateId: candidates.id, shortId: candidates.shortId, name: candidates.name, stage: candidates.stage })
      .from(hhResponses)
      .innerJoin(candidates, eq(candidates.id, hhResponses.localCandidateId))
      .where(and(eq(hhResponses.hhResponseId, item.id), eq(hhResponses.companyId, vac.companyId)))
      .limit(1)
    return { negotiationId: item.id, messagesCount: item.counters?.messages ?? 0, candidate: row ?? null }
  }))

  const noCandidate = withCandidate.filter(w => !w.candidate)
  const hasMessage  = withCandidate.filter(w => w.candidate && w.messagesCount > 0)
  const needsInvite = withCandidate.filter(w => w.candidate && w.messagesCount === 0)

  console.log(`[backlog] без привязанного кандидата в нашей БД (пропуск): ${noCandidate.length}`)
  console.log(`[backlog] уже есть сообщение → только поправить стадию (phone_interview, без текста): ${hasMessage.length}`)
  console.log(`[backlog] сообщений ещё не было → отправить приглашение + phone_interview: ${needsInvite.length}`)

  if (!SEND) {
    console.log("\n[backlog] dry-run — ничего не применено. Повторить с --send для применения.")
    console.log("Примеры needsInvite:", needsInvite.slice(0, 5).map(w => `${w.negotiationId} ${w.candidate?.name}`))
    process.exit(0)
  }

  const effDefaults = await getEffectiveMessageDefaults(vac.companyId)
  let fixedOnly = 0, invited = 0, errors = 0

  // ── Шаг 3а: только поправить стадию (без сообщения) ────────────────────
  for (let i = 0; i < hasMessage.length; i += BATCH) {
    const batch = hasMessage.slice(i, i + BATCH)
    await Promise.all(batch.map(async (w) => {
      try {
        await changeNegotiationState(token.accessToken, w.negotiationId, "invitation", undefined, undefined, undefined, vac.companyId)
        fixedOnly++
      } catch (err) {
        errors++
        console.warn(`[backlog] fix-stage FAILED ${w.negotiationId}:`, err instanceof Error ? err.message : err)
      }
    }))
    if (i + BATCH < hasMessage.length) await sleep(1000)
  }
  console.log(`[backlog] стадия поправлена без повторного сообщения: ${fixedOnly}`)

  // ── Шаг 3б: отправить приглашение + перевести стадию ───────────────────
  for (let i = 0; i < needsInvite.length; i += BATCH) {
    const batch = needsInvite.slice(i, i + BATCH)
    await Promise.all(batch.map(async (w) => {
      if (!w.candidate) return
      try {
        const { firstName } = await getCandidateFirstName(w.candidate.candidateId)
        const demoToken = w.candidate.shortId ?? w.candidate.candidateId
        const demoLink = `${getAppBaseUrl()}/demo/${demoToken}`
        const tpl = effDefaults.inviteMessage
        let message = renderTemplate(tpl, {
          name: firstName,
          vacancy: vac.title,
          company: "",
          demo_link: demoLink,
        })
        if (!message.includes(demoLink)) message = `${message}\n\n${demoLink}`
        await changeNegotiationState(token.accessToken, w.negotiationId, "invitation", message, undefined, undefined, vac.companyId)
        if (w.candidate.stage === "new") {
          await db.update(candidates).set({ stage: "primary_contact", updatedAt: new Date() }).where(eq(candidates.id, w.candidate.candidateId))
        }
        invited++
        console.log(`[backlog] INVITED: ${w.negotiationId} ${w.candidate.name}`)
      } catch (err) {
        errors++
        console.warn(`[backlog] invite FAILED ${w.negotiationId}:`, err instanceof Error ? err.message : err)
      }
    }))
    if (i + BATCH < needsInvite.length) await sleep(1500)
  }

  console.log(`\n[backlog] ГОТОВО. поправлено-без-сообщения=${fixedOnly} приглашено-заново=${invited} ошибок=${errors} пропущено(нет кандидата)=${noCandidate.length}`)
}

main().then(() => process.exit(0)).catch(err => {
  console.error("[backlog] ОШИБКА:", err)
  process.exit(1)
})
