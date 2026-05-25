// Жизненный цикл вакансии — единый источник правды для UI/API.
//
// В БД vacancies.status — свободный text без CHECK-констрейнта, и исторически
// сосуществует несколько значений. Их сводим к ТРЁМ состояниям жизненного цикла:
//
//   active  — вакансия работает (draft / active / published / null)
//   paused  — временно приостановлена (paused)
//   closed  — закрыта = в архиве (archived / closed / closed_success / closed_cancelled)
//
// Переходы (см. меню «Действия» на /hr/vacancies/[id]):
//   active → Остановить → paused
//   paused → Возобновить → active
//   active|paused → Закрыть → closed (= архив)
//   closed → Восстановить → active
//
// Новых значений status не вводим — все нужные уже существуют, поэтому
// миграция не требуется (status — text-колонка без enum/CHECK).

export type VacancyLifecycle = "active" | "paused" | "closed"

// Все значения status, которые означают «закрыта / в архиве».
export const CLOSED_VACANCY_STATUSES = [
  "archived",
  "closed",
  "closed_success",
  "closed_cancelled",
] as const

const CLOSED_SET: ReadonlySet<string> = new Set(CLOSED_VACANCY_STATUSES)

export function getVacancyLifecycle(status: string | null | undefined): VacancyLifecycle {
  if (status === "paused") return "paused"
  if (status && CLOSED_SET.has(status)) return "closed"
  // draft / active / published / null / неизвестное — считаем рабочим состоянием.
  return "active"
}

export function isClosedVacancy(status: string | null | undefined): boolean {
  return getVacancyLifecycle(status) === "closed"
}

// Канонические целевые значения status для переходов из меню «Действия».
// Возобновление и восстановление ведут в «active» — то же значение, что и
// «Запустить» на странице вакансии (active/published эквивалентны для всех
// фильтров, см. lib/vacancies/filters.ts).
export const VACANCY_STATUS_ON_RESUME  = "active"   as const  // Возобновить
export const VACANCY_STATUS_ON_PAUSE   = "paused"   as const  // Остановить
export const VACANCY_STATUS_ON_CLOSE   = "archived" as const  // Закрыть (= в архив)
export const VACANCY_STATUS_ON_RESTORE = "active"   as const  // Восстановить
