/**
 * scripts/hh-fix-primary-contact-stage.ts
 *
 * Одноразовый ops-скрипт (08.07). Находка: наш дефолт inviteHhStage="consider"
 * переводит кандидата в hh-стадию "Подумать" (employer_state/funnel_stage),
 * а НЕ в "Первичный контакт" (действие phone_interview) — хотя в НАШЕЙ
 * платформе этот же переход называется "Первичный контакт". Юрий (владелец
 * продукта): использовать реальный hh-экшен phone_interview, чтобы кандидаты
 * по факту оказывались в папке hh.ru «Первичный контакт», не «Подумать».
 *
 * Действия:
 *   1. Правит spec.resumeThresholds.inviteHhStage вакансии → "phone_interview"
 *      (root-cause фикс на будущее — новые авто-инвайты пойдут сразу верно).
 *   2. Для уже приглашённых hh-кандидатов (source=hh, stage IN primary_contact/
 *      demo_opened) проверяет их РЕАЛЬНЫЙ employer_state на hh.ru; если он
 *      "consider" (застрял на "Подумать") — переводит на phone_interview
 *      БЕЗ повторной отправки текста (кандидат уже получил ссылку на демо
 *      при исходном приглашении). Если employer_state уже phone_interview
 *      или дальше по воронке (interview/offer/hired/discard_*) — НЕ трогает
 *      (не откатываем прогресс, если HR уже двигал вручную).
 *
 * По умолчанию --dry-run (только план). --send — применяет реально.
 * Троттлинг как в mass-rescore-vacancy.ts: максимум 3 одновременно, пауза
 * между пачками — не душить hh API rate-limit.
 *
 * Запуск (на сервере, из /var/www/my-komanda):
 *   pnpm exec tsx --env-file=.env scripts/hh-fix-primary-contact-stage.ts \
 *     --vacancy=2db5e23e-acca-4f0e-9335-6c6b16474866
 *   pnpm exec tsx --env-file=.env scripts/hh-fix-primary-contact-stage.ts \
 *     --vacancy=2db5e23e-acca-4f0e-9335-6c6b16474866 --send
 */

import { db } from "../lib/db"
import { candidates, vacancies, hhResponses } from "../lib/db/schema"
import { and, eq, inArray, isNull } from "drizzle-orm"
import { getSpec, saveSpec } from "../lib/core/spec/store"
import { getValidToken } from "../lib/hh-helpers"
import { changeNegotiationState } from "../lib/hh-api"

function arg(name: string): string | undefined {
  const pfx = `--${name}=`
  const found = process.argv.find(a => a.startsWith(pfx))
  return found ? found.slice(pfx.length) : undefined
}
const SEND = process.argv.includes("--send")
const CONCURRENCY = 3

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function main() {
  const vacancyId = arg("vacancy")
  if (!vacancyId) {
    console.error("Использование: --vacancy=<uuid> [--send]")
    process.exit(1)
  }

  const [vac] = await db
    .select({ id: vacancies.id, title: vacancies.title, companyId: vacancies.companyId })
    .from(vacancies)
    .where(eq(vacancies.id, vacancyId))
    .limit(1)
  if (!vac) { console.error("Вакансия не найдена:", vacancyId); process.exit(1) }

  console.log(`[fix] Вакансия "${vac.title}" (${vac.id})${SEND ? " — РЕЖИМ SEND" : " — dry-run"}`)

  // ── Шаг 1: root-cause — inviteHhStage → phone_interview ────────────────
  const spec = await getSpec(vacancyId)
  const currentInviteHhStage = spec?.resumeThresholds?.inviteHhStage ?? "consider"
  console.log(`\n[fix] resumeThresholds.inviteHhStage сейчас = "${currentInviteHhStage}"`)
  if (currentInviteHhStage !== "phone_interview") {
    console.log(`[fix] → нужно поменять на "phone_interview"`)
    if (SEND && spec) {
      const updated = {
        ...spec,
        resumeThresholds: { ...spec.resumeThresholds, inviteHhStage: "phone_interview" as const },
      }
      await saveSpec(vacancyId, updated)
      console.log(`[fix] resumeThresholds.inviteHhStage обновлён → "phone_interview"`)
    }
  } else {
    console.log(`[fix] уже верно, не трогаем`)
  }

  // ── Шаг 2: живые hh-кандидаты, уже приглашённые ────────────────────────
  const invited = await db
    .select({
      id: candidates.id,
      shortId: candidates.shortId,
      name: candidates.name,
      stage: candidates.stage,
      hhResponseId: hhResponses.hhResponseId,
    })
    .from(candidates)
    .innerJoin(hhResponses, eq(hhResponses.localCandidateId, candidates.id))
    .where(and(
      eq(candidates.vacancyId, vacancyId),
      eq(candidates.source, "hh"),
      inArray(candidates.stage, ["primary_contact", "demo_opened"]),
      isNull(candidates.deletedAt),
    ))

  console.log(`\n[fix] уже приглашённых hh-кандидатов для проверки: ${invited.length}`)

  const token = await getValidToken(vac.companyId)
  if (!token) {
    console.error("[fix] нет валидного hh-токена компании — прерываю")
    process.exit(1)
  }

  let checked = 0, alreadyOk = 0, needsFix = 0, fixed = 0, ahead = 0, errors = 0
  const BATCH = CONCURRENCY

  for (let i = 0; i < invited.length; i += BATCH) {
    const batch = invited.slice(i, i + BATCH)
    await Promise.all(batch.map(async (c) => {
      const label = `#${c.shortId ?? c.id.slice(0, 8)} ${c.name ?? ""}`.trim()
      try {
        const res = await fetch(`https://api.hh.ru/negotiations/${c.hhResponseId}`, {
          headers: { Authorization: `Bearer ${token.accessToken}` },
        })
        if (!res.ok) { errors++; console.warn(`[fix] GET failed ${label}: ${res.status}`); return }
        const data = await res.json() as { employer_state?: { id?: string } }
        checked++
        const empState = data.employer_state?.id ?? "unknown"
        if (empState === "phone_interview" || empState === "consider") {
          if (empState === "phone_interview") {
            alreadyOk++
            return
          }
          // empState === "consider" → застрял на "Подумать", нужно поправить
          needsFix++
          console.log(`[fix] needs-fix (consider→phone_interview): ${label}`)
          if (SEND) {
            await changeNegotiationState(token.accessToken, c.hhResponseId, "invitation", undefined, undefined, undefined, vac.companyId)
            fixed++
            console.log(`[fix] FIXED: ${label}`)
          }
        } else {
          // interview/offer/hired/discard_* и т.п. — дальше по воронке или
          // терминальное состояние, НЕ трогаем (не откатываем прогресс).
          ahead++
        }
      } catch (err) {
        errors++
        console.warn(`[fix] ошибка на ${label}:`, err instanceof Error ? err.message : err)
      }
    }))
    if (i + BATCH < invited.length) await sleep(1200)
  }

  console.log(`\n[fix] ИТОГО: проверено=${checked} уже-верно(phone_interview)=${alreadyOk} дальше-по-воронке(не трогаем)=${ahead} требовали-фикса=${needsFix} исправлено=${fixed} ошибок=${errors}`)
  if (!SEND) console.log("[fix] dry-run — ничего не применено. Повторить с --send для применения.")
}

main().then(() => process.exit(0)).catch(err => {
  console.error("[fix] ОШИБКА:", err)
  process.exit(1)
})
