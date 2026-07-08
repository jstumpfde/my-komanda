/**
 * scripts/vacancy-manual-review-sweep.ts
 *
 * Одноразовый ops-скрипт (07.07-08.07, спасение вакансии
 * "Маркетолог по работе с AI/нейросетями В2В" от архивации hh —
 * см. память callagent/vacancy-launch-2026-07-08). Разбирает "непристроенных"
 * кандидатов ОДНОЙ вакансии после mass-rescore-vacancy.ts (--dims=resume):
 *
 *   1) stage='new' (никогда не оценивались / ждут решения) — по свежему
 *      resume_score против spec.resumeThresholds.upperThreshold:
 *        score >= upper → стадия primary_contact, sendMessage=true
 *          (реальный hh-инвайт через trySyncStageToHh — ТОЧНО та же функция,
 *          что вызывает живой роут PUT /api/modules/hr/candidates/[id]/stage).
 *        score <  upper → стадия preliminary_reject, БЕЗ сообщения
 *          (обратимо, hh не трогаем — HR смотрит и решает сам, см. lib/stages.ts).
 *   2) stage IN (primary_contact demo_opened) с зависшим auto_processing_stopped
 *      (reason below_threshold_manual_review / portrait_below_threshold_reject /
 *      portrait_pending_manual) — уже приглашены, просто снимаем стоп-флаг,
 *      чтобы дожимы/автоматика снова их вели. Стадию НЕ трогаем, сообщений НЕ шлём.
 *
 * По умолчанию --dry-run (только план + таблица). --send — применяет реально.
 *
 * Запуск (на сервере, из /var/www/my-komanda):
 *   pnpm exec tsx --env-file=.env.local scripts/vacancy-manual-review-sweep.ts \
 *     --vacancy=2db5e23e-acca-4f0e-9335-6c6b16474866
 *   # затем, после проверки таблицы:
 *   pnpm exec tsx --env-file=.env.local scripts/vacancy-manual-review-sweep.ts \
 *     --vacancy=2db5e23e-acca-4f0e-9335-6c6b16474866 --send
 *
 * Требует: DATABASE_URL, HH-токен компании (для реального инвайта через hh).
 * НЕ трогает других кандидатов/вакансий. НЕ отправляет отказы (только
 * preliminary_reject — обратимая тихая стадия, см. lib/stages.ts:269).
 */

import { db } from "../lib/db"
import { candidates, vacancies } from "../lib/db/schema"
import { and, eq, inArray, isNull } from "drizzle-orm"
import { getSpec } from "../lib/core/spec/store"
import { trySyncStageToHh } from "../lib/hh/sync-stage"

function arg(name: string): string | undefined {
  const pfx = `--${name}=`
  const found = process.argv.find(a => a.startsWith(pfx))
  return found ? found.slice(pfx.length) : undefined
}
const SEND = process.argv.includes("--send")

const STUCK_REASONS = [
  "below_threshold_manual_review",
  "portrait_below_threshold",
  "portrait_pending_manual",
] as const

async function main() {
  const vacancyId = arg("vacancy")
  if (!vacancyId) {
    console.error("Использование: --vacancy=<uuid> [--send]")
    process.exit(1)
  }

  const [vac] = await db
    .select({ id: vacancies.id, title: vacancies.title })
    .from(vacancies)
    .where(eq(vacancies.id, vacancyId))
    .limit(1)
  if (!vac) {
    console.error("Вакансия не найдена:", vacancyId)
    process.exit(1)
  }

  const spec = await getSpec(vacancyId)
  const upper = spec?.resumeThresholds?.upperThreshold ?? 75
  console.log(`[sweep] Вакансия "${vac.title}" (${vac.id}) — порог upperThreshold=${upper}${SEND ? " — РЕЖИМ SEND" : " — dry-run"}`)

  // ── Часть 1: stage='new' → решение advance/hold ────────────────────────
  const fresh = await db
    .select({
      id: candidates.id,
      shortId: candidates.shortId,
      name: candidates.name,
      resumeScore: candidates.resumeScore,
    })
    .from(candidates)
    .where(and(eq(candidates.vacancyId, vacancyId), eq(candidates.stage, "new"), isNull(candidates.deletedAt)))

  type Decision = { id: string; label: string; score: number | null; action: "advance" | "hold" | "skip-unscored" }
  const decisions: Decision[] = fresh.map(c => {
    const label = `#${c.shortId ?? c.id.slice(0, 8)} ${c.name ?? ""}`.trim()
    if (c.resumeScore == null) return { id: c.id, label, score: null, action: "skip-unscored" }
    return { id: c.id, label, score: c.resumeScore, action: c.resumeScore >= upper ? "advance" : "hold" }
  })

  console.log(`\n[sweep] stage=new: ${fresh.length} кандидатов`)
  for (const d of decisions) {
    console.log(`  ${d.action.padEnd(14)} score=${String(d.score).padEnd(4)} ${d.label}`)
  }
  const toAdvance = decisions.filter(d => d.action === "advance")
  const toHold = decisions.filter(d => d.action === "hold")
  const unscored = decisions.filter(d => d.action === "skip-unscored")
  console.log(`[sweep] итого: advance=${toAdvance.length} hold(preliminary_reject)=${toHold.length} unscored(пропуск)=${unscored.length}`)

  // ── Часть 2: снять зависший стоп-флаг у уже приглашённых ──────────────
  const stuck = await db
    .select({ id: candidates.id, shortId: candidates.shortId, name: candidates.name, stage: candidates.stage, reason: candidates.autoProcessingStoppedReason })
    .from(candidates)
    .where(and(
      eq(candidates.vacancyId, vacancyId),
      inArray(candidates.stage, ["primary_contact", "demo_opened"]),
      eq(candidates.autoProcessingStopped, true),
      inArray(candidates.autoProcessingStoppedReason, [...STUCK_REASONS]),
      isNull(candidates.deletedAt),
    ))
  console.log(`\n[sweep] уже приглашены, но зависли на стоп-флаге: ${stuck.length}`)
  for (const s of stuck) {
    console.log(`  clear-stop      stage=${(s.stage ?? "").padEnd(16)} reason=${s.reason} #${s.shortId ?? s.id.slice(0, 8)} ${s.name ?? ""}`)
  }

  if (!SEND) {
    console.log("\n[sweep] dry-run — ничего не применено. Повторить с --send для применения.")
    process.exit(0)
  }

  // ── Применение ──────────────────────────────────────────────────────
  let advanced = 0, held = 0, cleared = 0

  for (const d of toAdvance) {
    await db.update(candidates).set({ stage: "primary_contact", updatedAt: new Date() }).where(eq(candidates.id, d.id))
    try {
      await trySyncStageToHh(d.id, "primary_contact")
      advanced++
      console.log(`[sweep] advance OK: ${d.label}`)
    } catch (err) {
      console.warn(`[sweep] advance HH-SYNC FAILED (стадия уже проставлена, сообщение могло не уйти): ${d.label}`, err)
    }
  }

  for (const d of toHold) {
    await db.update(candidates).set({ stage: "preliminary_reject", updatedAt: new Date() }).where(eq(candidates.id, d.id))
    held++
  }
  console.log(`[sweep] hold (preliminary_reject) применено: ${held}`)

  for (const s of stuck) {
    await db.update(candidates)
      .set({ autoProcessingStopped: false, autoProcessingStoppedReason: null, autoProcessingStoppedAt: null })
      .where(eq(candidates.id, s.id))
    cleared++
  }
  console.log(`[sweep] стоп-флаг снят: ${cleared}`)

  console.log(`\n[sweep] ГОТОВО. advance=${advanced} hold=${held} cleared=${cleared} unscored-пропущено=${unscored.length}`)
}

main().then(() => process.exit(0)).catch(err => {
  console.error("[sweep] ОШИБКА:", err)
  process.exit(1)
})
