/**
 * scripts/send-adhoc-candidate-message.ts
 *
 * Одноразовая ручная отправка сообщения одному или нескольким кандидатам
 * в hh-чат (Company24), в обход воронки/дожимов — для точечных ad-hoc
 * рассылок (напр. извинение, разовое уточнение, ручной анонс).
 *
 * Переиспользует ТОЧНО те же функции, что и cron дожима
 * (app/api/cron/follow-up/route.ts):
 *   - getValidToken(companyId)        — lib/hh-helpers.ts (токен hh компании,
 *                                        авто-рефреш)
 *   - getCandidateFirstName(id)       — lib/messaging/candidate-name.ts
 *                                        (централизованный резолвер {{name}})
 *   - renderTemplate(text, vars)      — lib/template-renderer.ts (плейсхолдеры
 *                                        {{name}}/{{vacancy}}/{{demo_link}} и
 *                                        legacy-алиасы)
 *   - sendNegotiationMessage(...)     — lib/hh-api.ts (страж исходящих
 *                                        guardOutgoingMessage встроен внутрь —
 *                                        НЕ обходим и не дублируем)
 * negotiationId берём как в follow-up: последний по created_at hh_responses
 * этого кандидата (самый свежий чат — на случай нескольких откликов после
 * переопубликации вакансии).
 *
 * demo_link строится ИДЕНТИЧНО follow-up: https://company24.pro/demo/<id>,
 * где <id> = candidates.shortId ?? candidates.token ?? candidates.id.
 *
 * Ничего доп. в БД писать не нужно: «Чат hh» карточки кандидата — live-прокси
 * к hh API (GET /api/integrations/hh/messages/[hhResponseId] ходит в hh
 * напрямую), отдельной таблицы истории сообщений в проекте нет — проверено
 * чтением app/api/integrations/hh/messages/[hhResponseId]/route.ts и
 * components/candidates/hh-chat-thread.tsx. Отправленное сообщение появится
 * в «Чат hh» само при следующем открытии/обновлении таба.
 *
 * Безопасность:
 *   - По умолчанию --dry-run (ничего не шлём) — печатаем кому/что/в какой
 *     negotiation уйдёт. Реальная отправка — только с явным --send.
 *   - Пропускаем кандидатов в терминальных стадиях stage='rejected'|'hired'
 *     (не тревожим тех, с кем воронка уже закрыта).
 *   - guardOutgoingMessage (внутри sendNegotiationMessage) чистит
 *     неподставленные {{переменные}}/артефакты и может ПРИДЕРЖАТЬ сообщение
 *     (held_messages) — это НЕ обходим.
 *
 * Аргументы CLI:
 *   --candidate=<uuid>[,<uuid>...]   ОБЯЗАТЕЛЕН — id кандидата(ов), через запятую
 *   --text="..."                     ОБЯЗАТЕЛЕН — текст с плейсхолдерами
 *                                     {{name}}, {{vacancy}}, {{demo_link}}
 *                                     (и другие canonical/legacy — см.
 *                                     lib/template-renderer.ts)
 *   --dry-run                        по умолчанию TRUE — ничего не отправляет
 *   --send                           реальная отправка (выключает dry-run)
 *
 * Запуск (dry-run, по умолчанию):
 *   pnpm exec tsx --env-file=.env --env-file=.env.local \
 *     scripts/send-adhoc-candidate-message.ts \
 *     --candidate=6916db01-a765-4c4e-a652-81475566f95b \
 *     --text="{{name}}, добрый день! Ссылка на демо: {{demo_link}}"
 *
 * Запуск (реальная отправка):
 *   pnpm exec tsx --env-file=.env --env-file=.env.local \
 *     scripts/send-adhoc-candidate-message.ts \
 *     --candidate=id1,id2 --text="..." --send
 *
 * Требует env: DATABASE_URL (+ ANTHROPIC_API_KEY не нужен — здесь AI не используется).
 */

import { eq, desc } from "drizzle-orm"
import { db, pgClient } from "@/lib/db"
import { candidates, vacancies, companies, hhResponses } from "@/lib/db/schema"
import { sendNegotiationMessage } from "@/lib/hh-api"
import { getValidToken } from "@/lib/hh-helpers"
import { renderTemplate } from "@/lib/template-renderer"
import { getCandidateFirstName } from "@/lib/messaging/candidate-name"

// ─── CLI args ──────────────────────────────────────────────────────────────

interface Options {
  candidateIds: string[]
  text: string
  send: boolean
  help: boolean
}

function parseArgs(argv: string[]): Options {
  const args = argv.slice(2)
  let candidateIds: string[] = []
  let text = ""
  let send = false
  let help = false
  for (const a of args) {
    if (a === "--help" || a === "-h") { help = true; continue }
    if (a === "--send") { send = true; continue }
    if (a === "--dry-run") { send = false; continue } // явный override, если после --send
    if (a.startsWith("--candidate=")) {
      candidateIds = a.slice("--candidate=".length).split(",").map(s => s.trim()).filter(Boolean)
      continue
    }
    if (a.startsWith("--text=")) {
      text = a.slice("--text=".length)
      continue
    }
  }
  return { candidateIds, text, send, help }
}

function printHelp() {
  console.log(`send-adhoc-candidate-message — ручная разовая отправка сообщения в hh-чат.

  --candidate=<uuid>[,<uuid>...]   ОБЯЗАТЕЛЕН — id кандидата(ов) через запятую
  --text="..."                     ОБЯЗАТЕЛЕН — текст с плейсхолдерами
                                    {{name}}, {{vacancy}}, {{demo_link}} и др.
  --dry-run                        по умолчанию TRUE — ничего не отправляет,
                                    только печатает план
  --send                           реальная отправка в hh (выключает dry-run)

Пример (dry-run):
  pnpm exec tsx --env-file=.env --env-file=.env.local \\
    scripts/send-adhoc-candidate-message.ts \\
    --candidate=6916db01-a765-4c4e-a652-81475566f95b \\
    --text="{{name}}, добрый день! Ссылка: {{demo_link}}"

Пример (отправка):
  pnpm exec tsx --env-file=.env --env-file=.env.local \\
    scripts/send-adhoc-candidate-message.ts \\
    --candidate=id1,id2 --text="..." --send
`)
}

const TERMINAL_STAGES = new Set(["rejected", "hired"])

// ─── main ─────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv)
  if (opts.help) { printHelp(); process.exit(0) }
  if (!opts.candidateIds.length) {
    console.error("Ошибка: --candidate=<uuid>[,<uuid>...] обязателен. --help для справки.")
    process.exit(1)
  }
  if (!opts.text.trim()) {
    console.error("Ошибка: --text=\"...\" обязателен. --help для справки.")
    process.exit(1)
  }
  if (!process.env.DATABASE_URL) { console.error("DATABASE_URL не задан"); process.exit(1) }

  const dryRun = !opts.send

  console.log(`\n[${new Date().toISOString()}] send-adhoc-candidate-message`)
  console.log(`  Режим: ${dryRun ? "DRY-RUN (ничего не отправляем)" : "SEND (реальная отправка в hh)"}`)
  console.log(`  Кандидатов: ${opts.candidateIds.length}`)
  console.log(`  Текст-шаблон: ${JSON.stringify(opts.text)}\n`)

  let sentCount = 0
  let skippedCount = 0
  let errorCount = 0

  // Кэш company-level данных (название, токен) — компания встречается часто
  // при массовой рассылке по одной вакансии.
  const companyNameCache = new Map<string, string>()
  const tokenCache = new Map<string, Awaited<ReturnType<typeof getValidToken>>>()

  for (let i = 0; i < opts.candidateIds.length; i++) {
    const candidateId = opts.candidateIds[i]
    const label = `${i + 1}/${opts.candidateIds.length}`

    try {
      const [cand] = await db
        .select({
          id:        candidates.id,
          name:      candidates.name,
          stage:     candidates.stage,
          vacancyId: candidates.vacancyId,
          shortId:   candidates.shortId,
          token:     candidates.token,
        })
        .from(candidates)
        .where(eq(candidates.id, candidateId))
        .limit(1)

      if (!cand) {
        console.error(`  ${label} [${candidateId}] ПРОПУЩЕН: кандидат не найден`)
        skippedCount++
        continue
      }

      // Безопасность: не тревожим тех, с кем воронка уже закрыта.
      if (TERMINAL_STAGES.has(cand.stage ?? "")) {
        console.log(`  ${label} [${candidateId}] ПРОПУЩЕН: стадия «${cand.stage}» терминальна (rejected/hired)`)
        skippedCount++
        continue
      }

      const [vac] = await db
        .select({ id: vacancies.id, title: vacancies.title, companyId: vacancies.companyId })
        .from(vacancies)
        .where(eq(vacancies.id, cand.vacancyId))
        .limit(1)
      if (!vac) {
        console.error(`  ${label} [${candidateId}] ПРОПУЩЕН: вакансия не найдена`)
        skippedCount++
        continue
      }

      // Последний по created_at hh-отклик кандидата — как в follow-up (после
      // переопубликации вакансии свежий чат может отличаться от первого).
      const [hhResp] = await db
        .select({ hhResponseId: hhResponses.hhResponseId })
        .from(hhResponses)
        .where(eq(hhResponses.localCandidateId, candidateId))
        .orderBy(desc(hhResponses.createdAt))
        .limit(1)
      if (!hhResp) {
        console.error(`  ${label} [${candidateId}] ПРОПУЩЕН: нет привязанного hh-отклика (no_hh_response_link)`)
        skippedCount++
        continue
      }

      // Название компании (для {{company}}) — кэш на весь прогон.
      let companyName = companyNameCache.get(vac.companyId)
      if (companyName === undefined) {
        const [companyRow] = await db
          .select({ name: companies.name })
          .from(companies)
          .where(eq(companies.id, vac.companyId))
          .limit(1)
        companyName = companyRow?.name?.trim() || "Company24"
        companyNameCache.set(vac.companyId, companyName)
      }

      const { firstName } = await getCandidateFirstName(candidateId)

      // demo_link — идентично follow-up: shortId → token → id.
      const tokenForUrl = cand.shortId ?? cand.token ?? candidateId
      const demoUrl = `https://company24.pro/demo/${tokenForUrl}`

      const finalText = renderTemplate(opts.text, {
        name:      firstName,
        vacancy:   vac.title || "",
        company:   companyName,
        demo_link: demoUrl,
      })

      console.log(`  ${label} [${candidateId}] кандидат «${cand.name}» (имя для подстановки: «${firstName}»), вакансия «${vac.title}»`)
      console.log(`         negotiationId=${hhResp.hhResponseId}`)
      console.log(`         текст → ${JSON.stringify(finalText)}`)

      if (dryRun) {
        console.log(`         DRY-RUN: не отправлено`)
        continue
      }

      // Токен hh компании — кэш на весь прогон (одна компания часто встречается
      // при рассылке по одной вакансии).
      let tokenResult = tokenCache.get(vac.companyId)
      if (tokenResult === undefined) {
        tokenResult = await getValidToken(vac.companyId)
        tokenCache.set(vac.companyId, tokenResult)
      }
      if (!tokenResult) {
        console.error(`  ${label} [${candidateId}] ОШИБКА: нет валидного hh-токена компании (no_hh_token)`)
        errorCount++
        continue
      }

      let held = false
      try {
        await sendNegotiationMessage(
          tokenResult.accessToken,
          hhResp.hhResponseId,
          finalText,
          vac.companyId,
          () => { held = true },
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`  ${label} [${candidateId}] ОШИБКА отправки: ${msg}`)
        errorCount++
        continue
      }

      if (held) {
        // Страж придержал сообщение (messageGuardHold) — НЕ доставлено,
        // ждёт ручной отправки на /hr/held-messages. Не считаем «отправлено».
        console.log(`         ПРИДЕРЖАНО стражем (messageGuardHold) — см. /hr/held-messages, НЕ доставлено`)
        skippedCount++
        continue
      }

      console.log(`         ОТПРАВЛЕНО`)
      sentCount++
    } catch (err) {
      console.error(`  ${label} [${candidateId}] ФАТАЛЬНАЯ ОШИБКА:`, err instanceof Error ? err.message : err)
      errorCount++
    }
  }

  console.log(`\n=== ИТОГО (${dryRun ? "DRY-RUN" : "SEND"}) ===`)
  console.log(`  Отправлено: ${sentCount}`)
  console.log(`  Пропущено:  ${skippedCount}`)
  console.log(`  Ошибок:     ${errorCount}`)
  console.log("")
}

main()
  .then(async () => { await pgClient.end({ timeout: 5 }); process.exit(0) })
  .catch(async (err) => {
    console.error("[send-adhoc-candidate-message] ФАТАЛЬНАЯ ОШИБКА:", err instanceof Error ? err.message : err)
    await pgClient.end({ timeout: 5 }).catch(() => { /* ignore */ })
    process.exit(1)
  })
