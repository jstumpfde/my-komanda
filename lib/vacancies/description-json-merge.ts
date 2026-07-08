// Слияние vacancy.descriptionJson при общем сохранении вакансии (PUT/PATCH
// /api/modules/hr/vacancies/[id]).
//
// Почему это отдельная функция, а не inline-spread:
// descriptionJson — «мешок» саб-секций (anketa, automation, branding, pipeline,
// funnelV2, finalScreens …). Часть из них сохраняется ВЫДЕЛЕННЫМИ роутами
// (свой URL, свой read-merge-write), и их значение НЕ отражается обратно в
// состояние карточки вакансии на клиенте. Клиент держит СВОЮ копию descriptionJson
// (загружена при открытии страницы) и при сохранении анкеты/заголовка/колонок
// раньше слал { ...existing, anketa } — целиком. Эта копия устаревает
// относительно независимых сейвов → общий PUT затирал свежую секцию устаревшей
// клиентской копией (баг Юрия 08.07: «воронка 2 каждый раз слетает»; тот же
// класс — finalScreens/offer/testTask/referenceCheck/videoIntro/anketaIntro).
//
// Правило: (1) мёржим на уровне корня — переданные ключи перекрывают, остальные
// сохраняются свежими из БД; (2) ключи выделенных роутов НИКОГДА не берём из
// входящего payload — всегда оставляем копию из БД (эти роуты — единственный
// источник правды по ним; общий сейв их не шлёт легитимно, только устаревшим
// эхом снапшота).
//
// ВАЖНО: сюда попадают ТОЛЬКО ключи, которые НЕ сохраняются через общий роут
// вакансии. contentStep, например, сохраняется частичным payload на общий роут
// ({ description_json: { contentStep } }) — его сюда добавлять НЕЛЬЗЯ (иначе сейв
// contentStep перестанет проходить). От устаревания contentStep защищает
// частичный payload на клиенте (см. карточку вакансии — спреды заменены на
// точечные payload'ы).

// Ключи descriptionJson, которыми владеют выделенные роуты. Общее сохранение
// вакансии их не трогает — источник правды в БД.
export const INDEPENDENTLY_MANAGED_KEYS = [
  "funnelV2",       // /funnel-v2 (конструктор «Воронка 2», owner-only)
  "finalScreens",   // /final-screens
  "offer",          // /offer
  "referenceCheck", // /reference-check
  "videoIntro",     // /video-intro
  "anketaIntro",    // /anketa-intro
  "testTask",       // /test-task (v1-конструктор)
] as const

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
