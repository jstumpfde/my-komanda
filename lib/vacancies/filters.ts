// Канонический фильтр «активная вакансия».
//
// В БД сосуществуют два варианта vacancies.status, оба обозначают
// «опубликовано и доступно для откликов»:
//   - 'published' — основной (vacancies созданные через нашу платформу)
//   - 'active'    — исторический, у части компаний (например, Орлинок)
//
// Запросы, которые показывают «активные вакансии» (KPI на дашборде,
// расчёт счётчиков, фильтры списков), должны принимать ОБА значения,
// иначе получаем «Активные вакансии: 0» при реальных трёх активных.
//
// Не путать с другими статусами:
//   - 'draft'   — черновик, ещё не публиковали
//   - 'paused'  — приостановили вручную
//   - 'closed'  — закрыли (нанимать больше некого)
//
// Используется через inArray(vacancies.status, ACTIVE_VACANCY_STATUSES)
// в Drizzle, или = ANY($1) в сыром SQL.

export type ActiveVacancyStatus = "active" | "published"

// Объявляем как обычный (mutable) массив строк, не readonly: Drizzle's
// inArray() требует мутабельный T[] и не принимает `readonly T[]`. Менять
// массив в рантайме никто не должен — он de-facto константа.
export const ACTIVE_VACANCY_STATUSES: ActiveVacancyStatus[] = ["active", "published"]

export function isActiveVacancyStatus(value: unknown): value is ActiveVacancyStatus {
  return typeof value === "string" && (ACTIVE_VACANCY_STATUSES as string[]).includes(value)
}
