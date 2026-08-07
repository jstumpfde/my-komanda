// Единый слой определений «метрика отчёта → дата СОБЫТИЯ» (аудит 10.07 +
// доработка 07.08: раньше coalesce-выражения дублировались по 3 раза внутри
// lib/hr/build-report.ts — один источник правды снижает риск, что при
// правке метрики забудут поправить не все места).
//
// КОНТРАКТ (карта метрика → дата, откуда её берём):
//
//   Нанято          → candidates.hired_at, fallback created_at.
//                      hired_at пишется в момент перехода в стадию 'hired'
//                      (ручной stage-роут + funnel-v2 advance-stage /
//                      runtime-executor). Для кандидатов, нанятых ДО того как
//                      появилась колонка (миграция 0274), она забэкфиллена из
//                      stage_history (последний переход to='hired'), а если и
//                      истории нет — из updated_at. Поэтому на уровне запроса
//                      достаточно coalesce(hired_at, created_at): у кого нет
//                      hired_at, но stage='hired' — такое не должно
//                      встречаться после бэкфилла, но fallback на created_at
//                      всё равно гарантирует, что кандидат не пропадёт из «all».
//   Отказано/       → candidates.rejection_at, fallback created_at.
//   Сам отказался     rejection_at пишется во ВСЕХ путях отказа
//                      (lib/rejection/execute.ts — единая точка выхода,
//                      покрывает и авто-, и ручной отказ). rejection_initiator
//                      различает «компания отказала» vs «сам отказался».
//   Демо (прошёл)   → coalesce(
//                        demo_progress_json->>'completedAt',
//                        second_demo_invited_at (переход часть1→часть2),
//                        created_at (только если override_content_block_id
//                          задан — «упрощённый» контур без явной даты)
//                      ). Обязателен гейт «событие было» (IS NOT NULL) —
//                      без периода inPeriod()=true, и без гейта в «Демо»
//                      попали бы вообще все кандидаты, а не только дошедшие.
//   Тест (сдал)     → test_submissions.submitted_at (EXISTS-подзапрос;
//                      незавершённые попытки без submitted_at не считаются —
//                      раньше считались, это тоже было расхождением).
//   Анкет/Собес./     → candidates.created_at (дата ОТКЛИКА, сознательно).
//   Решение            Это метрики ОБЪЁМА/состояния пайплайна («сколько
//                      новых кандидатов дошло до Х»), а не метрики
//                      «когда что-то случилось» — дата отклика тут корректна.
//   Авто-причина    → candidates.auto_processing_stopped_at, fallback
//   остановки          created_at.
//
// ИНВАРИАНТ «all»: period="all" → from=to=null → inPeriod()=sql`true` для
// каждой метрики → WHERE-фильтр по дате события вырождается в WHERE true,
// остаётся только гейт «событие произошло» (stage='hired' /
// rejectionInitiator filter / coalesce(...) is not null / submitted_at is not
// null). Это ТЕ ЖЕ гейты, что определяли множество кандидатов метрики ДО
// перехода на event-даты (аудит 10.07) — то есть итоговые числа за «всё
// время» не должны были измениться тем коммитом, и не меняются этой
// доработкой (она только выносит SQL-выражения в общий модуль, логику не
// трогает).

import { sql } from "drizzle-orm"
import { candidates } from "@/lib/db/schema"

// ─── SQL-выражения даты события (используются в count(*) FILTER (...)) ────

/** Дата найма: событие hired_at, fallback — дата отклика. */
export const hiredEventAtSql = sql`coalesce(${candidates.hiredAt}, ${candidates.createdAt})`

/** Дата отказа (любого — от компании или от кандидата): rejection_at, fallback — дата отклика. */
export const rejectionEventAtSql = sql`coalesce(${candidates.rejectionAt}, ${candidates.createdAt})`

/**
 * Дата прохождения демо: сначала явная дата завершения демо
 * (demo_progress_json.completedAt), иначе дата приглашения во 2-ю часть
 * (second_demo_invited_at — тоже подтверждённый факт прохождения 1-й части),
 * иначе — только если это override-контур без демо-логики — дата отклика.
 * Возвращает NULL, если ни одно из событий не случилось (кандидат демо не
 * проходил) — вызывающий код обязан добавить гейт `is not null`, иначе
 * inPeriod(...)=true без периода посчитает вообще всех.
 */
export const demoCompletedEventAtSql = sql`coalesce(
  (${candidates.demoProgressJson} ->> 'completedAt')::timestamptz,
  ${candidates.secondDemoInvitedAt},
  case when ${candidates.overrideContentBlockId} is not null then ${candidates.createdAt} end
)`

/** Дата авто-остановки обработки (стоп-фактор/дедуп/AI): fallback — дата отклика. */
export const autoStoppedEventAtSql = sql`coalesce(${candidates.autoProcessingStoppedAt}, ${candidates.createdAt})`

// ─── Пер-кандидатные (JS) definitions — для случаев, когда строка кандидата
// уже загружена в память (напр. будущие дашборды/скрипты-сверки), и для
// юнит-тестов контракта «резолва даты события» независимо от БД. ───────────

export interface StageHistoryEntry {
  from?: string | null
  to?: string | null
  at?: string | null
  date?: string | null // старые записи писали `date`, не `at`
  note?: string | null
  reason?: string | null
}

/**
 * Последняя (максимальная) дата перехода в одну из целевых стадий по
 * stage_history. Возвращает null, если истории нет / она не массив / нет
 * подходящих переходов / у перехода нет валидной даты. Никогда не бросает
 * исключение на «грязных» данных — история заполняется free-form годами,
 * молчаливый null безопаснее краша отчёта.
 */
export function latestTransitionAt(
  stageHistory: unknown,
  targetStages: readonly string[],
): Date | null {
  if (!Array.isArray(stageHistory) || stageHistory.length === 0) return null
  const targets = new Set(targetStages)
  let latest: Date | null = null
  for (const raw of stageHistory) {
    if (!raw || typeof raw !== "object") continue
    const entry = raw as StageHistoryEntry
    const to = entry.to ?? undefined
    if (to === undefined || !targets.has(to)) continue
    const rawAt = entry.at ?? entry.date ?? null
    if (!rawAt) continue
    const at = new Date(rawAt)
    if (Number.isNaN(at.getTime())) continue
    if (!latest || at.getTime() > latest.getTime()) latest = at
  }
  return latest
}

/**
 * Резолвит дату события метрики по приоритету:
 *   1. primary (выделенная колонка события — hired_at/rejection_at/…), если задана;
 *   2. последний переход в целевую стадию по stage_history;
 *   3. fallback (как правило — created_at, «дата отклика» — гарантирует, что
 *      кандидат без истории и без выделенной колонки всё равно попадёт в
 *      отчёт «за всё время», а не пропадёт молча).
 * Возвращает null только если primary/history/fallback все не заданы.
 */
export function resolveEventDate(opts: {
  primary?: Date | string | null
  stageHistory?: unknown
  targetStages?: readonly string[]
  fallback?: Date | string | null
}): Date | null {
  if (opts.primary) {
    const d = new Date(opts.primary)
    if (!Number.isNaN(d.getTime())) return d
  }
  if (opts.targetStages && opts.targetStages.length > 0) {
    const historyDate = latestTransitionAt(opts.stageHistory, opts.targetStages)
    if (historyDate) return historyDate
  }
  if (opts.fallback) {
    const d = new Date(opts.fallback)
    if (!Number.isNaN(d.getTime())) return d
  }
  return null
}

/** Стадии-цели для резолва даты найма из stage_history (см. resolveEventDate). */
export const HIRED_TARGET_STAGES = ["hired", "started_work"] as const

/** Стадии-цели для резолва даты отказа из stage_history. */
export const REJECTED_TARGET_STAGES = ["rejected"] as const
