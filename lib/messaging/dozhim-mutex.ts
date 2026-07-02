// #61 Взаимоисключение дожимов между «Воронкой v2» и legacy-кампанией.
//
// БЛОКЕР включения воронки v2 на проде: без гейта кандидат вакансии с
// funnelV2.enabled=true мог получать ДВОЙНЫЕ касания — legacy-кампания
// («вкладка Дожим» вакансии) и v2-стадии слали дожим одновременно, оба через
// один и тот же cron (app/api/cron/follow-up/route.ts).
//
// Правило (продуктовое решение зафиксировано в задаче #61):
//   1. funnelV2RuntimeEnabled=true  → касания шлёт ТОЛЬКО v2-контур;
//      legacy-кампания на этой вакансии пропускается.
//   2. funnelV2RuntimeEnabled=false/отсутствует → всё как раньше (legacy
//      работает, v2 и так молчит без флага).
//   3. Гейт проверяется НА МОМЕНТ ОТПРАВКИ (не только планирования) — эта
//      функция вызывается из processOneTouch непосредственно перед send,
//      после свежей загрузки vacancy из БД.
//
// funnelV2RuntimeEnabled — булев столбец vacancies, синхронный с
// descriptionJson.funnelV2.enabled (держит route
// app/api/modules/hr/vacancies/[id]/funnel-v2/route.ts: config.enabled ВСЕГДА
// === этот флаг). Тот же столбец — единственный источник «воронка v2
// активна» для funnel-v2-tick и всего v2-рантайма
// (lib/funnel-v2/stage-completion-handler.ts, app/api/cron/funnel-v2-tick/route.ts).
// Читаем его напрямую вместо повторного парсинга JSON-конфига.

/** v2-касание помечено префиксом branch — см. lib/funnel-v2/runtime-executor.ts. */
export function isFunnelV2Touch(branch: string | null | undefined): boolean {
  return typeof branch === "string" && branch.startsWith("funnelv2:")
}

export type DozhimMutexDecision =
  | { allowed: true }
  // v2 выключили между планированием и отправкой (или касание — хвост от
  // прошлого включения) → отменяем: стадия v2 больше не актуальна.
  | { allowed: false; action: "cancel"; reason: "v2_runtime_disabled" }
  // legacy-касание вакансии, на которой сейчас активна v2 → НЕ отменяем
  // (обратимо: выключат v2 обратно — legacy продолжит без пересоздания
  // кампании), просто пропускаем этот тик, строка остаётся pending.
  | { allowed: false; action: "skip"; reason: "legacy_superseded_by_v2" }

/**
 * Решает, можно ли отправить конкретное follow-up-касание прямо сейчас,
 * исходя из того, какой контур (v2 / legacy) сейчас владеет дожимом вакансии.
 *
 * @param branch            follow_up_messages.branch отправляемого касания.
 * @param funnelV2RuntimeEnabled  vacancies.funnel_v2_runtime_enabled, ПРОЧИТАННЫЙ
 *                          непосредственно перед отправкой (не из кэша/снапшота
 *                          на момент планирования).
 */
export function decideDozhimMutex(
  branch: string | null | undefined,
  funnelV2RuntimeEnabled: boolean | null | undefined,
): DozhimMutexDecision {
  const isV2Touch = isFunnelV2Touch(branch)
  const v2Active = funnelV2RuntimeEnabled === true

  if (isV2Touch && !v2Active) {
    return { allowed: false, action: "cancel", reason: "v2_runtime_disabled" }
  }
  if (!isV2Touch && v2Active) {
    return { allowed: false, action: "skip", reason: "legacy_superseded_by_v2" }
  }
  return { allowed: true }
}
