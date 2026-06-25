/**
 * Рантайм воронки v2 — разрешение контентного блока текущей стадии.
 *
 * Фаза 0:
 * - findStageContentBlockId — РЕАЛЬНО реализована (чистая логика, без БД).
 * - resolveCurrentStageContent — заглушка (запрос demos из БД — Фаза 1).
 *
 * Фаза 1:
 * - resolveCurrentStageContent — реализована через Drizzle (запрос demos WHERE id=contentBlockId).
 */

import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { demos } from "@/lib/db/schema"
import type { FunnelV2Config } from "@/lib/funnel-v2/types"
import type { CandidateForExecutor, VacancyForExecutor } from "@/lib/funnel-v2/runtime-executor"

// ────────────────────────────────────────────────────────────────────────────────
// Чистая логика (без БД — легко тестируется)
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Найти contentBlockId стадии по её id.
 *
 * Возвращает contentBlockId (строку) если:
 * - стадия с данным `stageId` существует в `funnelV2.stages`,
 * - и у неё задан `contentBlockId` (не null, не undefined, не пустая строка).
 *
 * Во всех остальных случаях (стадия не найдена, contentBlockId не задан) — null.
 *
 * @param funnelV2 Конфиг воронки v2 (из vacancy.descriptionJson.funnelV2).
 * @param stageId  id стадии.
 * @returns contentBlockId или null.
 */
export function findStageContentBlockId(
  funnelV2: FunnelV2Config,
  stageId: string,
): string | null {
  const stage = funnelV2.stages.find((s) => s.id === stageId)
  if (!stage) return null
  return stage.contentBlockId ?? null
}

// ────────────────────────────────────────────────────────────────────────────────
// Результат разрешения контента
// ────────────────────────────────────────────────────────────────────────────────

/** Разрешённый контент текущей стадии кандидата. */
export interface ResolvedStageContent {
  stageId:        string
  contentBlockId: string
  /** kind из таблицы demos (например, 'block:demo', 'block:test', 'demo', 'test'). */
  demoKind:       string
  /** id записи в таблице demos. */
  demoId:         string
  /** Содержимое уроков (lessonsJson) для отдачи клиенту. */
  lessonsJson:    unknown
  /** Настройки постдемо (postDemoSettings) для клиента. */
  postDemoSettings: unknown
  /** Заголовок блока (title). */
  title:          string | null
}

// ────────────────────────────────────────────────────────────────────────────────
// Реализация (Фаза 1)
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Разрешить контентный блок текущей стадии кандидата в v2-воронке.
 *
 * Используется в /demo и /test роутах: при флаге `funnelV2RuntimeEnabled`
 * контент берётся из текущей стадии кандидата, а не из легаси kind='demo'/'test'.
 *
 * Алгоритм:
 * 1. Получить stageId из candidate.funnelV2StateJson.stageId.
 * 2. Вызвать findStageContentBlockId(vacancy.funnelV2, stageId).
 * 3. Если contentBlockId=null → вернуть null (легаси-путь или стадия без контента).
 * 4. Запросить demos WHERE id=contentBlockId из БД.
 * 5. Вернуть ResolvedStageContent или null если demos запись не найдена.
 *
 * @param candidate Кандидат с funnelV2StateJson.
 * @param vacancy   Вакансия с funnelV2.
 * @returns Разрешённый контент или null (→ роут использует легаси-логику).
 */
export async function resolveCurrentStageContent(
  candidate: CandidateForExecutor,
  vacancy: VacancyForExecutor,
): Promise<ResolvedStageContent | null> {
  // Шаг 1: получить stageId из состояния кандидата
  const state = candidate.funnelV2StateJson
  if (!state?.stageId) return null

  // Шаг 2: найти contentBlockId в конфиге воронки
  const contentBlockId = findStageContentBlockId(vacancy.funnelV2, state.stageId)
  if (!contentBlockId) return null

  // Шаг 3: запросить demos WHERE id=contentBlockId
  const [demoRow] = await db
    .select({
      id:               demos.id,
      title:            demos.title,
      kind:             demos.kind,
      lessonsJson:      demos.lessonsJson,
      postDemoSettings: demos.postDemoSettings,
    })
    .from(demos)
    .where(eq(demos.id, contentBlockId))
    .limit(1)

  if (!demoRow) return null

  return {
    stageId:          state.stageId,
    contentBlockId,
    demoKind:         demoRow.kind ?? "demo",
    demoId:           demoRow.id,
    lessonsJson:      demoRow.lessonsJson,
    postDemoSettings: demoRow.postDemoSettings,
    title:            demoRow.title,
  }
}
