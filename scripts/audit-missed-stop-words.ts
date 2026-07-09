/**
 * scripts/audit-missed-stop-words.ts
 *
 * Одноразовый ops-скрипт (09.07). На 4 вакансиях был выключен флаг
 * aiProcessSettings.stopWordsChatEnabled (побочный эффект дубль-записи
 * из Конструктора воронки при выключенном funnel_runtime — см. чат 09.07,
 * кейс Горячев/Revoluterra), из-за чего scan-incoming ВООБЩЕ не проверял
 * входящие сообщения кандидатов на стоп-слова. Флаг уже включён обратно
 * (09.07) — новые сообщения теперь ловятся. Этот скрипт ретроактивно
 * проверяет кандидатов, которые ВСЁ ЕЩЁ получают дожим (pending touches),
 * на предмет уже написанных стоп-слов в hh-чате, пропущенных из-за бага.
 *
 * По умолчанию --dry-run. --apply — реально останавливает автоматику
 * (automationPaused/autoProcessingStopped) и отменяет pending follow_up_messages.
 *
 * Запуск (на сервере, из /var/www/my-komanda):
 *   pnpm exec tsx --env-file=.env scripts/audit-missed-stop-words.ts --vacancy=<uuid>
 *   pnpm exec tsx --env-file=.env scripts/audit-missed-stop-words.ts --vacancy=<uuid> --apply
 */

import { db } from "../lib/db"
import { candidates, vacancies, hhResponses, followUpMessages } from "../lib/db/schema"
import { and, eq, inArray, ne } from "drizzle-orm"
import { getValidToken } from "../lib/hh-helpers"
import { getNegotiationMessages } from "../lib/hh-api"
import { matchStopWordList, matchStopWordWith, STOP_WORDS } from "../lib/followup/stop-words"

function arg(name: string): string | undefined {
  const pfx = `--${name}=`
  const found = process.argv.find(a => a.startsWith(pfx))
  return found ? found.slice(pfx.length) : undefined
}
const APPLY = process.argv.includes("--apply")
const BATCH = 4

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function main() {
  const vacancyId = arg("vacancy")
  if (!vacancyId) { console.error("Использование: --vacancy=<uuid> [--apply]"); process.exit(1) }

  const [vac] = await db
    .select({
      id: vacancies.id, title: vacancies.title, companyId: vacancies.companyId,
      stopWordsJson: vacancies.stopWordsJson,
    })
    .from(vacancies)
    .where(eq(vacancies.id, vacancyId))
    .limit(1)
  if (!vac) { console.error("Вакансия не найдена"); process.exit(1) }
  console.log(`[audit] Вакансия "${vac.title}" (${vac.id})${APPLY ? " — РЕЖИМ APPLY" : " — dry-run"}`)

  const token = await getValidToken(vac.companyId)
  if (!token) { console.error("[audit] нет валидного hh-токена"); process.exit(1) }

  const vacStopWords = (vac.stopWordsJson ?? []).filter((s): s is string => typeof s === "string")

  // Кандидаты этой вакансии, которые ещё не остановлены и у которых есть
  // pending дожим (только они реально под риском получить лишнее сообщение).
  const candRows = await db
    .select({ id: candidates.id, name: candidates.name, stage: candidates.stage })
    .from(candidates)
    .where(and(
      eq(candidates.vacancyId, vac.id),
      eq(candidates.autoProcessingStopped, false),
      ne(candidates.stage, "rejected"),
      ne(candidates.stage, "hired"),
    ))
  const pendingIds = new Set(
    (await db.select({ candidateId: followUpMessages.candidateId }).from(followUpMessages)
      .where(and(eq(followUpMessages.status, "pending"), inArray(followUpMessages.candidateId, candRows.map(c => c.id)))))
      .map(r => r.candidateId),
  )
  const targets = candRows.filter(c => pendingIds.has(c.id))
  console.log(`[audit] кандидатов с активным дожимом: ${targets.length}`)

  const hits: { candidateId: string; name: string | null; text: string }[] = []
  let checked = 0, noResponse = 0, errors = 0

  for (let i = 0; i < targets.length; i += BATCH) {
    const batch = targets.slice(i, i + BATCH)
    await Promise.all(batch.map(async (c) => {
      try {
        const [resp] = await db
          .select({ hhResponseId: hhResponses.hhResponseId })
          .from(hhResponses)
          .where(and(eq(hhResponses.localCandidateId, c.id), eq(hhResponses.companyId, vac.companyId)))
          .limit(1)
        if (!resp) { noResponse++; return }
        const messages = await getNegotiationMessages(token.accessToken, resp.hhResponseId)
        checked++
        for (const m of messages) {
          if (m.author?.participant_type !== "applicant") continue
          const text = (m.text ?? "").trim()
          if (!text) continue
          const matched = vacStopWords.length > 0
            ? matchStopWordList(text, vacStopWords) !== null
            : matchStopWordWith(text, STOP_WORDS)
          if (matched) {
            hits.push({ candidateId: c.id, name: c.name, text })
            break
          }
        }
      } catch (err) {
        errors++
        console.warn(`[audit] ошибка ${c.id}:`, err instanceof Error ? err.message : err)
      }
    }))
    if (i + BATCH < targets.length) await sleep(700)
  }

  console.log(`[audit] проверено=${checked} без hh-отклика=${noResponse} ошибок=${errors}`)
  console.log(`[audit] найдено пропущенных стоп-слов: ${hits.length}`)
  hits.forEach(h => console.log(`  - ${h.name} (${h.candidateId}): "${h.text.slice(0, 80)}"`))

  if (!APPLY) {
    console.log("\n[audit] dry-run — ничего не остановлено. Повторить с --apply для применения.")
    process.exit(0)
  }

  for (const h of hits) {
    await db.update(candidates).set({
      automationPaused: true,
      autoProcessingStopped: true,
      autoProcessingStoppedReason: "stop_word_no_stage",
      autoProcessingStoppedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(candidates.id, h.candidateId))
    await db.update(followUpMessages).set({
      status: "cancelled", errorMessage: "stop_word_no_stage",
    }).where(and(eq(followUpMessages.candidateId, h.candidateId), eq(followUpMessages.status, "pending")))
  }
  console.log(`\n[audit] ГОТОВО. остановлено кандидатов: ${hits.length}`)
}

main().then(() => process.exit(0)).catch(err => {
  console.error("[audit] ОШИБКА:", err)
  process.exit(1)
})
