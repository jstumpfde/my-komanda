// Условия попадания интервью в кастомную стадию таб-фильтра над списком
// интервью (app/(modules)/hr/interviews/page.tsx). Вынесено в чистые функции
// без React — задача 13.07 (координатор), подзадачи 1a/1b:
//  - "manual": было no-op (возвращало весь массив) — реальная фильтрация по
//    вручную назначенному тегу (см. filterByStageCondition ниже, opts.manualIds).
//  - "repeat_interview" / "outcome_passed": новые условия.
//
// "outcome_passed" читает РЕАЛЬНЫЙ исход интервью — calendar_events.interview_decision
// (advance|offer|reject|reserve, drizzle "Воронка v2 Фаза 2"), а НЕ статус
// "Пройдено" (тот означает лишь "время интервью истекло", не "кандидат реально
// прошёл собеседование успешно" — Юрий явно указал не путать эти два понятия).
// Поле уже редактируется в components/candidates/candidate-drawer.tsx и пишется
// через существующий PATCH /api/modules/hr/calendar/[id] — здесь НЕ вводится
// параллельного хранилища для исхода, только чтение того же поля.
//
// Юнит-тесты: lib/interviews/stage-filters.test.ts (pnpm exec tsx --test).

export type StageCondition =
  | "manual"
  | "date_before"
  | "date_today"
  | "date_after"
  | "status_confirmed"
  | "status_pending"
  | "status_cancelled"
  // «Повторное интервью» — НЕ первое интервью этого кандидата (см. computeRepeatInterviewIds).
  | "repeat_interview"
  // «Исход = прошёл» — advance/offer в calendar_events.interview_decision.
  | "outcome_passed"

export type InterviewDecision = "advance" | "offer" | "reject" | "reserve" | null

// Решения, которые считаются «кандидат прошёл интервью успешно» — двигаем
// дальше по воронке (advance) или уже даём оффер (offer). "reject"/"reserve"/
// null НЕ считаются пройденными (reserve — не отказ, но и не явный успех).
const PASSED_DECISIONS: ReadonlySet<InterviewDecision> = new Set(["advance", "offer"])

export interface FilterableInterview {
  id: string
  candidateId: string | null
  date: Date
  status: string
  interviewDecision?: InterviewDecision
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

// Кандидаты без candidateId никогда не считаются «повторными» — не с чем
// группировать (интервью не привязано к карточке кандидата).
export function computeRepeatInterviewIds<T extends FilterableInterview>(interviews: T[]): Set<string> {
  const byCandidate = new Map<string, T[]>()
  for (const iv of interviews) {
    if (!iv.candidateId) continue
    const list = byCandidate.get(iv.candidateId)
    if (list) list.push(iv)
    else byCandidate.set(iv.candidateId, [iv])
  }
  const repeatIds = new Set<string>()
  for (const list of byCandidate.values()) {
    if (list.length < 2) continue
    const sorted = [...list].sort((a, b) => a.date.getTime() - b.date.getTime())
    for (let i = 1; i < sorted.length; i++) repeatIds.add(sorted[i].id)
  }
  return repeatIds
}

export interface FilterStageOpts {
  // Интервью, вручную помеченные тегом конкретной кастомной стадии (её id) —
  // Record<stageId, interviewId[]> с сервера уже сведён к Set для этой стадии
  // на стороне вызывающего кода.
  manualIds?: Set<string>
}

export function filterByStageCondition<T extends FilterableInterview>(
  interviews: T[],
  condition: StageCondition,
  opts: FilterStageOpts = {},
): T[] {
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  switch (condition) {
    // «Предстоящие» = сегодняшние (ещё идущие/будущие) + все следующие дни.
    case "date_after": return interviews.filter(iv => iv.date >= startOfToday)
    case "date_today": return interviews.filter(iv => isSameDay(iv.date, new Date()))
    case "date_before": return interviews.filter(iv => iv.date < startOfToday)
    case "status_confirmed": return interviews.filter(iv => iv.status === "Подтверждено")
    case "status_pending": return interviews.filter(iv => iv.status === "Ожидает")
    case "status_cancelled": return interviews.filter(iv => iv.status === "Отменено" || iv.status === "Не явился")
    case "manual": return interviews.filter(iv => opts.manualIds?.has(iv.id) ?? false)
    case "repeat_interview": {
      const ids = computeRepeatInterviewIds(interviews)
      return interviews.filter(iv => ids.has(iv.id))
    }
    case "outcome_passed": return interviews.filter(iv => PASSED_DECISIONS.has(iv.interviewDecision ?? null))
  }
}
