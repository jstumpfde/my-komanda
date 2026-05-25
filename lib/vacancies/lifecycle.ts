// Жизненный цикл вакансии — единый источник правды для UI/API.
//
// В БД vacancies.status — свободный text без CHECK-констрейнта, и исторически
// сосуществует несколько значений. Их сводим к ЧЕТЫРЁМ состояниям:
//
//   active  — вакансия работает (draft / active / published / null)
//   paused  — временно приостановлена (paused)
//   closed  — закрыта = в архиве (archived / closed / closed_success / closed_cancelled)
//   trashed — в корзине (vacancies.deleted_at IS NOT NULL) — авто-удаление через
//             companies.trash_retention_days. Отдельного status='trashed' НЕ вводим:
//             признак корзины — deleted_at, чтобы переиспользовать существующую
//             инфраструктуру soft-delete и не дублировать модель.
//
// Переходы (см. меню «Действия» на /hr/vacancies/[id] и «...» в списке):
//   active → Остановить → paused
//   paused → Возобновить → active
//   active|paused → Закрыть, в архив → closed
//   closed|trashed → Восстановить → active (для trashed = очистка deleted_at)
//   active|paused|closed → В корзину → trashed (deleted_at = now)
//   trashed → Удалить навсегда → запись удаляется из БД
//
// Новых значений status не вводим — все нужные уже существуют (status — text без
// enum/CHECK), для корзины используется deleted_at.

export type VacancyLifecycle = "active" | "paused" | "closed" | "trashed"

// Все значения status, которые означают «закрыта / в архиве».
export const CLOSED_VACANCY_STATUSES = [
  "archived",
  "closed",
  "closed_success",
  "closed_cancelled",
] as const

const CLOSED_SET: ReadonlySet<string> = new Set(CLOSED_VACANCY_STATUSES)

// Базовая классификация по status (без учёта корзины). Используется там, где
// deleted_at заведомо null (фильтры активных/архивных). Для полной картины с
// корзиной — getVacancyState() ниже.
export function getVacancyLifecycle(status: string | null | undefined): VacancyLifecycle {
  if (status === "paused") return "paused"
  if (status && CLOSED_SET.has(status)) return "closed"
  // draft / active / published / null / неизвестное — считаем рабочим состоянием.
  return "active"
}

// Полное состояние с учётом корзины: deleted_at имеет приоритет над status.
export function getVacancyState(
  input: { status?: string | null; deletedAt?: Date | string | null },
): VacancyLifecycle {
  if (input.deletedAt != null) return "trashed"
  return getVacancyLifecycle(input.status)
}

export function isClosedVacancy(status: string | null | undefined): boolean {
  return getVacancyLifecycle(status) === "closed"
}

// Прилагательное в родительном падеже для тултипа «Недоступно для … вакансии».
export function getLifecycleAdjLabel(lifecycle: VacancyLifecycle): string {
  switch (lifecycle) {
    case "paused":  return "приостановленной"
    case "closed":  return "закрытой"
    case "trashed": return "удалённой"
    default:        return "активной"
  }
}

// ─── Корзина: обратный отсчёт до авто-удаления ───────────────────────────────
const DAY_MS = 24 * 60 * 60 * 1000

// Сколько дней осталось до авто-удаления из корзины. 0 = удалится сегодня/просрочено.
export function getTrashDaysRemaining(
  deletedAt: Date | string | null | undefined,
  retentionDays: number,
): number {
  if (deletedAt == null) return retentionDays
  const deleted = typeof deletedAt === "string" ? new Date(deletedAt) : deletedAt
  if (Number.isNaN(deleted.getTime())) return retentionDays
  const deadline = deleted.getTime() + retentionDays * DAY_MS
  const ms = deadline - Date.now()
  return Math.max(0, Math.ceil(ms / DAY_MS))
}

// Человекочитаемый обратный отсчёт для строки корзины.
export function formatTrashCountdown(daysRemaining: number): string {
  if (daysRemaining <= 0) return "удалится сегодня"
  if (daysRemaining === 1) return "через 1 день"
  const mod10 = daysRemaining % 10
  const mod100 = daysRemaining % 100
  const noun =
    mod10 === 1 && mod100 !== 11 ? "день"
    : mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20) ? "дня"
    : "дней"
  return `через ${daysRemaining} ${noun}`
}

// Канонические целевые значения status для переходов из меню «Действия».
// Возобновление и восстановление ведут в «active» — то же значение, что и
// «Запустить» на странице вакансии (active/published эквивалентны для всех
// фильтров, см. lib/vacancies/filters.ts).
export const VACANCY_STATUS_ON_RESUME  = "active"   as const  // Возобновить
export const VACANCY_STATUS_ON_PAUSE   = "paused"   as const  // Остановить
export const VACANCY_STATUS_ON_CLOSE   = "archived" as const  // Закрыть (= в архив)
export const VACANCY_STATUS_ON_RESTORE = "active"   as const  // Восстановить
