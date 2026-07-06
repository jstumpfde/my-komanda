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
import { CandidateSpecSchema, normalizeMustHave, normalizeNiceToHave, normalizeDealBreakers } from "./types"

// Исполнитель запросов: глобальный db ИЛИ tx внутри db.transaction — чтобы
// saveSpec можно было вызвать атомарно вместе с другими записями (ТЗ №3).
type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]

// ─── Чтение ──────────────────────────────────────────────────────────────────

/**
 * Возвращает CandidateSpec из vacancy_specs или null, если записи нет.
 * null = новый контур для этой вакансии ещё не активирован → нужен buildSpecFromLegacy.
 *
 * БАГФИКС 06.07 (двойной инцидент, вакансия 6916): раньше JSON из БД отдавался
 * СЫРЫМ приведением типа (`as CandidateSpec`), без прогона через Zod. Строка/
 * партия могла быть записана ДО появления нового поля схемы (напр.
 * rejectionDelayMinutes) — тогда объект приходил в UI с этим полем = undefined.
 * UI спреды (`{...rt, otherField: x}`) переносили этот undefined дальше, а
 * JSON.stringify молча ВЫРЕЗАЕТ ключи с undefined из тела PUT-запроса — на
 * сервере Zod видел поле отсутствующим и подставлял ДЕФОЛТ схемы (rejectionDelay
 * → 60), затирая то, что реально стояло/вводилось. Прогон через
 * CandidateSpecSchema.safeParse() на ЧТЕНИИ бэкфиллит все отсутствующие поля
 * дефолтами СРАЗУ (получаем законченный объект без undefined-дыр), поэтому
 * дальнейшие patch()-спреды в UI больше не могут «потерять» поле. Невалидные
 * записи (не должны появляться, но на всякий случай) — возвращаем как есть,
 * чтобы не уронить рантайм скоринга.
 */
export async function getSpec(vacancyId: string): Promise<CandidateSpec | null> {
  const [row] = await db
    .select({ spec: vacancySpecs.spec })
    .from(vacancySpecs)
    .where(eq(vacancySpecs.vacancyId, vacancyId))
    .limit(1)

  if (!row) return null
  const parsed = CandidateSpecSchema.safeParse(row.spec)
  if (parsed.success) return parsed.data
  // Не должно происходить (saveSpec всегда пишет валидированные данные), но
  // если старая/повреждённая запись всё же не проходит схему целиком —
  // не роняем рантайм скоринга, отдаём как было.
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
  executor:  Executor = db,
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

  await executor
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
