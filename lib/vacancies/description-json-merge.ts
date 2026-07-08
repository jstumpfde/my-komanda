// Слияние vacancy.descriptionJson при общем сохранении вакансии (PUT/PATCH
// /api/modules/hr/vacancies/[id]).
//
// Почему это отдельная функция, а не inline-spread:
// descriptionJson — «мешок» саб-секций (anketa, automation, branding, pipeline,
// funnelV2 …). Часть из них сохраняется НЕЗАВИСИМЫМИ роутами:
//   • funnelV2 — свой owner-роут /funnel-v2 (автосейв конструктора «Воронка 2»)
// Клиент карточки вакансии держит СВОЮ копию descriptionJson (загружена при
// открытии страницы) и при сохранении анкеты/заголовка шлёт { ...existing, anketa }.
// Эта копия устаревает относительно независимых автосейвов. Раньше общий PUT
// перезаписывал descriptionJson целиком → свежая «Воронка 2» затиралась
// устаревшей клиентской копией сразу после сохранения анкеты (баг Юрия 08.07:
// «воронка 2 каждый раз слетает»).
//
// Правило: (1) мёржим на уровне корня — переданные ключи перекрывают, остальные
// сохраняются; (2) ключи, которыми владеют независимые роуты (funnelV2), НИКОГДА
// не берём из входящего payload — всегда оставляем копию из БД.

// Ключи descriptionJson, управляемые отдельными роутами. Общее сохранение
// вакансии их не трогает — источник правды в БД.
export const INDEPENDENTLY_MANAGED_KEYS = ["funnelV2"] as const

export function mergeDescriptionJson(
  current: unknown,
  incoming: unknown,
): Record<string, unknown> {
  const currentObj = current && typeof current === "object" ? { ...(current as Record<string, unknown>) } : {}
  const incomingObj = incoming && typeof incoming === "object" ? { ...(incoming as Record<string, unknown>) } : {}
  for (const key of INDEPENDENTLY_MANAGED_KEYS) {
    // Выкидываем из входящего — значение останется из currentObj (БД).
    delete incomingObj[key]
  }
  return { ...currentObj, ...incomingObj }
}
