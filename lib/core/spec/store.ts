/**
 * lib/core/spec/store.ts
 *
 * CRUD для таблицы vacancy_specs.
 * Серверный модуль — только для App Router route handlers.
 *
 * СТАТУС: БОЕВОЙ КОНТУР. getSpec() читается рантаймом скоринга резюме
 * (lib/hh/process-queue.ts, rescore- и rediscovery-роуты). saveSpec()
 * нормализует mustHave к формату { text, hard } этапа 2.
 */

import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancySpecs } from "@/lib/db/schema"
import type { CandidateSpec } from "./types"
import { normalizeMustHave, normalizeNiceToHave, normalizeDealBreakers } from "./types"

// ─── Чтение ──────────────────────────────────────────────────────────────────

/**
 * Возвращает CandidateSpec из vacancy_specs или null, если записи нет.
 * null = новый контур для этой вакансии ещё не активирован → нужен buildSpecFromLegacy.
 */
export async function getSpec(vacancyId: string): Promise<CandidateSpec | null> {
  const [row] = await db
    .select({ spec: vacancySpecs.spec })
    .from(vacancySpecs)
    .where(eq(vacancySpecs.vacancyId, vacancyId))
    .limit(1)

  if (!row) return null
  return row.spec as CandidateSpec
}

// ─── Запись ──────────────────────────────────────────────────────────────────

/**
 * Сохраняет CandidateSpec в vacancy_specs (upsert по vacancy_id).
 * updatedAt и updatedBy проставляются автоматически.
 */
export async function saveSpec(
  vacancyId: string,
  spec:      CandidateSpec,
  userId?:   string,
): Promise<void> {
  // Нормализуем списки критериев к каноническому формату объектов:
  // mustHave → { text, hard }, niceToHave → { text, importance },
  // dealBreakers → { text, hard }. Строки (legacy) разворачиваются в объекты
  // с дефолтами (hard:true / importance:"nice"). Хранение в одном формате
  // упрощает рантайм-читатели и dual-write.
  const specWithTs: CandidateSpec = {
    ...spec,
    mustHave:     normalizeMustHave(spec.mustHave),
    niceToHave:   normalizeNiceToHave(spec.niceToHave),
    dealBreakers: normalizeDealBreakers(spec.dealBreakers),
    updatedAt:    new Date().toISOString(),
  }

  await db
    .insert(vacancySpecs)
    .values({
      vacancyId,
      spec:       specWithTs,
      updatedAt:  new Date(),
      updatedBy:  userId ?? null,
    })
    .onConflictDoUpdate({
      target:  vacancySpecs.vacancyId,
      set: {
        spec:      specWithTs,
        updatedAt: new Date(),
        updatedBy: userId ?? null,
      },
    })
}

// ─── Удаление ─────────────────────────────────────────────────────────────────

/**
 * Удаляет запись spec для вакансии (при hard-delete вакансии).
 * CASCADE в FK сделает это автоматически при удалении из vacancies,
 * но можно вызвать явно для тестов и clean-up скриптов.
 */
export async function deleteSpec(vacancyId: string): Promise<void> {
  await db
    .delete(vacancySpecs)
    .where(eq(vacancySpecs.vacancyId, vacancyId))
}
