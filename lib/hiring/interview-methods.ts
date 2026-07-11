// lib/hiring/interview-methods.ts
//
// Нормализатор конфигурации способов интервью.
// Поддерживает как новую per-method модель (interviewMethodConfigs),
// так и legacy-поля (interviewMethods + slotDuration + bufferTime).

/** Все известные способы проведения интервью в нужном порядке отображения */
export const INTERVIEW_METHOD_ORDER = [
  'phone',
  'zoom',
  'telemost',
  'meet',
  'office',
] as const

export type InterviewMethodKey = typeof INTERVIEW_METHOD_ORDER[number]

export const INTERVIEW_METHOD_LABELS: Record<InterviewMethodKey, string> = {
  phone:    'Звонок по телефону',
  zoom:     'Zoom',
  telemost: 'Яндекс.Телемост',
  meet:     'Google Meet',
  office:   'В офисе',
}

/**
 * Канонические дефолты длительности по способу (Юрий, редизайн интервью:
 * звонок 15 / онлайн 25 / офис 45). Единственный источник — его же используют
 * настройки в календаре-хабе и публичная страница самозаписи.
 */
export const METHOD_DEFAULT_DURATIONS: Record<InterviewMethodKey, number> = {
  phone:    15,
  zoom:     25,
  telemost: 25,
  meet:     25,
  office:   45,
}

export const DEFAULT_METHOD_BUFFER = 15

/** Легаси-дефолт «одна длительность на все способы» (нормализация старых данных) */
const DEFAULT_DURATION = 45
const DEFAULT_BUFFER   = DEFAULT_METHOD_BUFFER

/** Конфиг одного способа интервью (нормализованный) */
export interface MethodConfig {
  method:   InterviewMethodKey
  enabled:  boolean
  duration: number
  buffer:   number
}

type ScheduleLike = {
  slotDuration?:          string
  bufferTime?:            string
  interviewMethods?:      string[]
  interviewMethodConfigs?: Array<{
    method:   string
    enabled:  boolean
    duration: number
    buffer:   number
  }>
}

/**
 * Нормализует настройки интервью в единый список MethodConfig.
 *
 * Логика:
 * 1. Если schedule.interviewMethodConfigs есть и непустой — берём его,
 *    сортируем по INTERVIEW_METHOD_ORDER, добиваем отсутствующие способы
 *    как { enabled: false, duration: дефолт способа, buffer: дефолт }.
 * 2. Иначе (legacy) — строим из interviewMethods (включённость),
 *    slotDuration (если задан — одна на все способы, иначе дефолт способа)
 *    и bufferTime (или дефолт 15).
 *
 * Всегда возвращает ровно 5 элементов в порядке INTERVIEW_METHOD_ORDER.
 */
export function getInterviewMethodConfigs(schedule: ScheduleLike | null | undefined): MethodConfig[] {
  const configs = schedule?.interviewMethodConfigs

  if (configs && configs.length > 0) {
    // Новая модель: сортируем и добиваем отсутствующие
    const byMethod = new Map(configs.map(c => [c.method, c]))

    return INTERVIEW_METHOD_ORDER.map(method => {
      const existing = byMethod.get(method)
      return {
        method,
        enabled:  existing?.enabled  ?? false,
        duration: existing?.duration ?? METHOD_DEFAULT_DURATIONS[method],
        buffer:   existing?.buffer   ?? DEFAULT_BUFFER,
      }
    })
  }

  // Legacy: строим из interviewMethods + общих slotDuration/bufferTime.
  // Явно заданный slotDuration сохраняет старую семантику «одна длительность
  // на все способы»; без него — канонический дефолт способа.
  const enabledSet = new Set<string>(schedule?.interviewMethods ?? [])
  const legacyDuration = schedule?.slotDuration ? parseInt(schedule.slotDuration, 10) || DEFAULT_DURATION : null
  const buffer         = schedule?.bufferTime   ? parseInt(schedule.bufferTime,   10) || DEFAULT_BUFFER   : DEFAULT_BUFFER

  return INTERVIEW_METHOD_ORDER.map(method => ({
    method,
    enabled:  enabledSet.has(method),
    duration: legacyDuration ?? METHOD_DEFAULT_DURATIONS[method],
    buffer,
  }))
}
