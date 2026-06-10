/**
 * lib/core/spec/store.ts
 *
 * CRUD для таблицы vacancy_specs.
 * Серверный модуль — только для App Router route handlers.
 *
 * СТАТУС: СПЯЩИЙ КОД. Вызывается только из /api/core/spec/[vacancyId].
 * Не подключён к рантайму скоринга/чат-бота.
 */

import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancySpecs } from "@/lib/db/schema"
import type { CandidateSpec } from "./types"

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
  const specWithTs: CandidateSpec = {
    ...spec,
    updatedAt: new Date().toISOString(),
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
