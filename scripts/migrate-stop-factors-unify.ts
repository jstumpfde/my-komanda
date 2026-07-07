/**
 * scripts/migrate-stop-factors-unify.ts
 *
 * Миграция данных к ЕДИНОМУ источнику истины стоп-факторов —
 * vacancies.stop_factors_json (инцидент 07.07, вакансия 2604V023).
 *
 * ДО унификации стоп-факторы жили в трёх рассинхронизированных местах:
 *   1. vacancies.stop_factors_json — БОЕВОЕ (его читает process-queue,
 *      реальные отсевы кандидатов);
 *   2. descriptionJson.anketa.stopFactors — карман конструктора вакансии,
 *      ДЕКОРАЦИЯ (рантайм не читал; формат [{id,label,enabled,value,ageRange}]);
 *   3. vacancy_specs.spec.stopFactors — карман «Портрета» (уходил только в
 *      промпт AI-скорера, жёсткий гейт его не видел).
 *
 * Скрипт для каждой вакансии переносит В БОЕВОЕ хранилище включённые факторы
 * из карманов (2) и (3), которых в боевом нет:
 *   - фактор в боевом ОТСУТСТВУЕТ или ВЫКЛЮЧЕН без заданных параметров →
 *     переносим (spec-источник приоритетнее anketa: он новее и структурно
 *     идентичен боевому; anketa переносится только в ещё пустые ключи);
 *   - фактор в боевом УЖЕ ВКЛЮЧЁН:
 *       значения совпадают → пропускаем («уже в боевом»);
 *       значения расходятся → КОНФЛИКТ: боевое главнее, НЕ перезаписываем,
 *       только логируем;
 *   - фактор в боевом выключен, но с заранее заполненными параметрами
 *     (напр. allowedCities задан, enabled=false) → трактуем как ОСОЗНАННО
 *     выключенный HR-ом → конфликт-лог, не трогаем;
 *   - spec-only факторы (driverLicense/jobHopping/timezone/customFactors)
 *     не имеют боевого аналога — остаются жить в спеке, не переносятся.
 *
 * documents из anketa-кармана НЕ переносится (боевой матчер его сознательно
 * не проверяет — см. lib/funnel-builder/anketa-stop-factors-bridge.ts).
 *
 * По умолчанию DRY-RUN (только печатает план). Запись — флаг --apply.
 *
 * Аргументы CLI:
 *   --apply              реально писать в vacancies.stop_factors_json
 *   --vacancy=<uuid>     обработать только одну вакансию (смоук-тест)
 *   --include-deleted    включить вакансии из корзины (по умолчанию пропускаются)
 *
 * Запуск (на сервере, из /var/www/my-komanda):
 *   pnpm exec tsx --env-file=.env.local scripts/migrate-stop-factors-unify.ts            # dry-run
 *   pnpm exec tsx --env-file=.env.local scripts/migrate-stop-factors-unify.ts --apply    # запись
 *
 * Требует env: DATABASE_URL.
 */

import { eq, isNull, and } from "drizzle-orm"
import { db, pgClient } from "@/lib/db"
import { vacancies, vacancySpecs } from "@/lib/db/schema"
import type { VacancyStopFactors } from "@/lib/db/schema"
import {
  fromAnketaStopFactors,
  type AnketaStopFactor,
} from "@/lib/funnel-builder/anketa-stop-factors-bridge"

// ─── CLI ─────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2)
const APPLY = argv.includes("--apply")
const INCLUDE_DELETED = argv.includes("--include-deleted")
const ONLY_VACANCY = argv.find(a => a.startsWith("--vacancy="))?.split("=")[1]

// ─── Типы отчёта ─────────────────────────────────────────────────────────────

type Action = "перенесено(spec)" | "перенесено(anketa)" | "пропущено" | "конфликт"

interface RowLog {
  vacancyId: string
  title: string
  factor: string
  action: Action
  detail: string
}

const rows: RowLog[] = []

// Общие ключи боевого формата (nativeLanguage переносим только из spec —
// в anketa-формате его никогда не было).
const BOEVOE_KEYS = [
  "city", "format", "age", "experience", "documents",
  "citizenship", "nativeLanguage", "salaryExpectation",
] as const
type BoevoeKey = typeof BOEVOE_KEYS[number]

// ─── Хелперы сравнения ───────────────────────────────────────────────────────

/** Нормализованный JSON фактора без enabled/rejectionText/undefined — для сравнения значений. */
function factorValueKey(f: Record<string, unknown> | undefined): string {
  if (!f) return "{}"
  const clean: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(f)) {
    if (k === "enabled" || k === "rejectionText" || v === undefined) continue
    if (Array.isArray(v)) {
      if (v.length === 0) continue
      clean[k] = [...v].map(x => typeof x === "string" ? x.trim().toLowerCase() : x).sort()
    } else if (typeof v === "string") {
      if (v.trim() === "") continue
      clean[k] = v.trim().toLowerCase()
    } else {
      clean[k] = v
    }
  }
  return JSON.stringify(Object.fromEntries(Object.entries(clean).sort(([a], [b]) => a.localeCompare(b))))
}

/** Есть ли у выключенного фактора осмысленно заполненные параметры (осознанный off)? */
function hasMeaningfulParams(f: Record<string, unknown> | undefined): boolean {
  return factorValueKey(f) !== "{}"
}

function isEnabled(f: unknown): boolean {
  return !!f && typeof f === "object" && (f as { enabled?: boolean }).enabled === true
}

/**
 * Решение по одному фактору-кандидату на перенос.
 * Возвращает объект фактора для записи или null (пропуск/конфликт — залогировано).
 */
function decideTransfer(opts: {
  vacancyId: string
  title: string
  factorKey: BoevoeKey
  source: "spec" | "anketa"
  incoming: Record<string, unknown>   // включённый фактор из кармана
  currentBoevoe: VacancyStopFactors
}): Record<string, unknown> | null {
  const { vacancyId, title, factorKey, source, incoming, currentBoevoe } = opts
  const existing = currentBoevoe[factorKey] as Record<string, unknown> | undefined
  const action = (a: Action, detail: string) =>
    rows.push({ vacancyId, title, factor: factorKey, action: a, detail })

  if (isEnabled(existing)) {
    if (factorValueKey(existing) === factorValueKey(incoming)) {
      action("пропущено", `уже включён в боевом с теми же параметрами (источник ${source})`)
    } else {
      action("конфликт", `боевое включено с другими параметрами — боевое главнее; ${source}=${factorValueKey(incoming)} боевое=${factorValueKey(existing)}`)
    }
    return null
  }
  if (existing && hasMeaningfulParams(existing)) {
    // enabled=false, но параметры заполнены — HR настроил и осознанно выключил.
    action("конфликт", `в боевом выключен, но с заполненными параметрами (осознанный off) — не включаем; ${source}=${factorValueKey(incoming)}`)
    return null
  }
  action(source === "spec" ? "перенесено(spec)" : "перенесено(anketa)", factorValueKey(incoming))
  return incoming
}

// ─── Основной проход ─────────────────────────────────────────────────────────

async function main() {
  console.log(`\n=== migrate-stop-factors-unify — ${APPLY ? "APPLY (запись!)" : "DRY-RUN (без записи)"} ===\n`)

  const where = ONLY_VACANCY
    ? (INCLUDE_DELETED ? eq(vacancies.id, ONLY_VACANCY) : and(eq(vacancies.id, ONLY_VACANCY), isNull(vacancies.deletedAt)))
    : (INCLUDE_DELETED ? undefined : isNull(vacancies.deletedAt))

  const vacRows = await db
    .select({
      id:              vacancies.id,
      title:           vacancies.title,
      stopFactorsJson: vacancies.stopFactorsJson,
      descriptionJson: vacancies.descriptionJson,
    })
    .from(vacancies)
    .where(where)

  const specRows = await db
    .select({ vacancyId: vacancySpecs.vacancyId, spec: vacancySpecs.spec })
    .from(vacancySpecs)
  const specByVacancy = new Map(specRows.map(r => [r.vacancyId, r.spec as Record<string, unknown>]))

  let updatedVacancies = 0

  for (const vac of vacRows) {
    const boevoe: VacancyStopFactors = { ...((vac.stopFactorsJson ?? {}) as VacancyStopFactors) }
    const next: VacancyStopFactors = { ...boevoe }
    let changed = false

    // ── Источник 1 (приоритетнее): spec.stopFactors («Портрет») ────────────
    const spec = specByVacancy.get(vac.id)
    const specSf = (spec?.stopFactors ?? {}) as Record<string, Record<string, unknown> | undefined>
    for (const key of BOEVOE_KEYS) {
      const incoming = specSf[key]
      if (!isEnabled(incoming)) continue
      const decided = decideTransfer({
        vacancyId: vac.id, title: vac.title ?? "", factorKey: key,
        source: "spec", incoming: incoming as Record<string, unknown>, currentBoevoe: next,
      })
      if (decided) {
        ;(next as Record<string, unknown>)[key] = decided
        changed = true
      }
    }

    // ── Источник 2: descriptionJson.anketa.stopFactors (конструктор) ───────
    const descJson = vac.descriptionJson as Record<string, unknown> | null
    const anketa = descJson?.anketa as Record<string, unknown> | undefined
    const anketaSf = (anketa?.stopFactors as AnketaStopFactor[] | undefined) ?? []
    const enabledAnketa = anketaSf.filter(
      f => f && f.enabled && f.id !== "documents", // documents боевой матчер не проверяет
    )
    if (enabledAnketa.length > 0) {
      // Конвертируем ВКЛЮЧЁННЫЕ факторы конструктора в боевой формат поверх
      // пустого объекта — получаем чистые кандидат-значения без примеси current.
      const converted = fromAnketaStopFactors(enabledAnketa, {})
      for (const [key, incoming] of Object.entries(converted) as Array<[BoevoeKey, Record<string, unknown>]>) {
        if (!isEnabled(incoming)) continue
        const decided = decideTransfer({
          vacancyId: vac.id, title: vac.title ?? "", factorKey: key,
          source: "anketa", incoming, currentBoevoe: next,
        })
        if (decided) {
          ;(next as Record<string, unknown>)[key] = decided
          changed = true
        }
      }
    }

    if (changed) {
      updatedVacancies++
      if (APPLY) {
        await db.update(vacancies).set({ stopFactorsJson: next }).where(eq(vacancies.id, vac.id))
      }
    }
  }

  // ── Отчёт ──────────────────────────────────────────────────────────────────
  if (rows.length === 0) {
    console.log("Нечего переносить: включённых факторов в карманах не найдено.\n")
  } else {
    const w1 = 38, w2 = 30, w3 = 18, w4 = 20
    console.log(
      "Вакансия".padEnd(w1) + "Название".padEnd(w2) + "Фактор".padEnd(w4) + "Действие".padEnd(w3) + "Детали",
    )
    console.log("─".repeat(140))
    for (const r of rows) {
      console.log(
        r.vacancyId.padEnd(w1) +
        (r.title.length > w2 - 2 ? r.title.slice(0, w2 - 3) + "…" : r.title).padEnd(w2) +
        r.factor.padEnd(w4) +
        r.action.padEnd(w3) +
        r.detail,
      )
    }
  }

  const count = (a: Action) => rows.filter(r => r.action === a).length
  console.log(`\n=== ИТОГО ===`)
  console.log(`  вакансий просмотрено:   ${vacRows.length}`)
  console.log(`  вакансий с переносом:   ${updatedVacancies}${APPLY ? " (ЗАПИСАНО)" : " (dry-run, НЕ записано)"}`)
  console.log(`  перенесено из spec:     ${count("перенесено(spec)")}`)
  console.log(`  перенесено из anketa:   ${count("перенесено(anketa)")}`)
  console.log(`  пропущено (совпадает):  ${count("пропущено")}`)
  console.log(`  конфликтов (боевое главнее): ${count("конфликт")}`)
  if (!APPLY) console.log(`\nЗапись НЕ выполнялась. Для применения: --apply`)
  console.log("")
}

main()
  .then(async () => { await pgClient.end({ timeout: 5 }); process.exit(0) })
  .catch(async (err) => {
    console.error("[migrate-stop-factors-unify] ФАТАЛЬНАЯ ОШИБКА:", err instanceof Error ? err.message : err)
    await pgClient.end({ timeout: 5 }).catch(() => { /* ignore */ })
    process.exit(1)
  })
