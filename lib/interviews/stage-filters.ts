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
// 15.07 (гибридные табы, решение владельца): добавлены "outcome_rejected"
// (тот же interview_decision, но "reject") и "stage_decision" (кандидат СЕЙЧАС
// стоит на стадии воронки "decision" — lib/stages.ts PLATFORM_STAGES). Заодно
// в этот же день переработана логика "Сегодня"/"Прошедшие" (см. FilterableInterview
// и case "date_today"/"date_before" ниже) — раньше уже завершившееся сегодня
// интервью выпадало из "Сегодня" (Revoluterra: 7 интервью на сегодня, таб
// показывал 2-3), теперь "Сегодня" = весь день целиком, без дублей в "Прошедшие".
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
  // «Исход = отказ» — reject в calendar_events.interview_decision.
  | "outcome_rejected"
  // «Стадия воронки = Решение» — кандидат сейчас на стадии "decision"
  // (lib/stages.ts PLATFORM_STAGES). Читает FilterableInterview.candidateStage.
  | "stage_decision"

export type InterviewDecision = "advance" | "offer" | "reject" | "reserve" | null

// Решения, которые считаются «кандидат прошёл интервью успешно» — двигаем
// дальше по воронке (advance) или уже даём оффер (offer). "reject"/"reserve"/
// null НЕ считаются пройденными (reserve — не отказ, но и не явный успех).
const PASSED_DECISIONS: ReadonlySet<InterviewDecision> = new Set(["advance", "offer"])

// Слаг стадии воронки «Решение» (lib/stages.ts PLATFORM_STAGES) — для
// condition "stage_decision". Не импортируем сам PLATFORM_STAGES сюда, чтобы
// модуль оставался чистым (без React/DB-зависимостей) — только слаг-строка.
const DECISION_STAGE_SLUG = "decision"

export interface FilterableInterview {
  id: string
  candidateId: string | null
  date: Date            // startAt интервью
  // Конец интервью. Нужен «Прошедшим» (14.07 → переработано 15.07):
  // «Прошедшие» = endAt < now И это НЕ сегодня (см. case "date_before") —
  // сегодняшние завершившиеся остаются в «Сегодня», без дублей. Опционален
  // для обратной совместимости — при отсутствии берётся date.
  endAt?: Date
  status: string
  interviewDecision?: InterviewDecision
  // «Решение» (condition "stage_decision", гибридные табы 15.07) — стадия
  // кандидата в воронке СЕЙЧАС (lib/stages.ts PLATFORM_STAGES, слаг
  // "decision"). Опционально: используется только этим условием.
  candidateStage?: string | null
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

// Статус отменённого интервью. Отдельная константа, чтобы «активные» табы
// (Предстоящие/Сегодня/Прошедшие) и hideSupersededCancelled трактовали отмену
// одинаково. NB: "Не явился" — это НЕ отмена (реальный прошедший исход), в
// активных табах он остаётся; в отдельный cancelled-таб его добирает условие
// status_cancelled (см. filterByStageCondition).
const CANCELLED_STATUS = "Отменено"

// Скрывает отменённые события кандидата, у которого есть более позднее
// АКТИВНОЕ (не отменённое) интервью: кандидат перезаписался — старое
// «Отменено» уже неактуально и не должно висеть НИГДЕ (ни в активных табах,
// ни в отдельном «Отменённые»). Активным считается любой статус ≠ "Отменено"
// (в т.ч. Подтверждено/Ожидает/Пройдено). Кандидаты без candidateId не
// группируются — их отменённые события не трогаем. Чистая функция (юнит-тест).
export function hideSupersededCancelled<T extends FilterableInterview>(interviews: T[]): T[] {
  const latestActiveAt = new Map<string, number>()
  for (const iv of interviews) {
    if (!iv.candidateId || iv.status === CANCELLED_STATUS) continue
    const t = iv.date.getTime()
    const prev = latestActiveAt.get(iv.candidateId)
    if (prev === undefined || t > prev) latestActiveAt.set(iv.candidateId, t)
  }
  return interviews.filter(iv => {
    if (iv.status !== CANCELLED_STATUS || !iv.candidateId) return true
    const active = latestActiveAt.get(iv.candidateId)
    // Прячем отменённое, только если активное интервью СТРОГО позже него.
    return active === undefined || active <= iv.date.getTime()
  })
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
  const now = new Date()
  // Конец интервью (для «Прошедшие»=закончилось и «идёт сейчас»). Если endAt
  // не передан — берём startAt (точка), поведение как раньше.
  const endOf = (iv: T) => iv.endAt ?? iv.date
  switch (condition) {
    // Активные табы по ВРЕМЕНИ. Отменённые (status="Отменено") сюда НЕ
    // попадают — они только в отдельном cancelled-табе. «Не явился» —
    // реальный прошедший исход, не прячем.
    //  • Предстоящие  — интервью начнётся ПОЗЖЕ сейчас (startAt > now).
    //  • Сегодня      — ВЕСЬ день целиком по startAt (решение владельца
    //                   15.07: раньше требовалось ещё endAt ≥ now, из-за чего
    //                   уже завершившиеся сегодня интервью выпадали из
    //                   «Сегодня» — у Revoluterra было 7 интервью на сегодня,
    //                   таб показывал 2-3). Включает уже завершившиеся.
    //  • Прошедшие    — интервью ЗАВЕРШИЛОСЬ (endAt < now) И это НЕ сегодня —
    //                   без дублей с «Сегодня» (то же решение 15.07).
    case "date_after": return interviews.filter(iv => iv.date > now && iv.status !== CANCELLED_STATUS)
    case "date_today": return interviews.filter(iv => isSameDay(iv.date, now) && iv.status !== CANCELLED_STATUS)
    case "date_before": return interviews.filter(iv => endOf(iv) < now && !isSameDay(iv.date, now) && iv.status !== CANCELLED_STATUS)
    case "status_confirmed": return interviews.filter(iv => iv.status === "Подтверждено")
    case "status_pending": return interviews.filter(iv => iv.status === "Ожидает")
    case "status_cancelled": return interviews.filter(iv => iv.status === "Отменено" || iv.status === "Не явился")
    case "manual": return interviews.filter(iv => opts.manualIds?.has(iv.id) ?? false)
    case "repeat_interview": {
      const ids = computeRepeatInterviewIds(interviews)
      return interviews.filter(iv => ids.has(iv.id))
    }
    case "outcome_passed": return interviews.filter(iv => PASSED_DECISIONS.has(iv.interviewDecision ?? null))
    case "outcome_rejected": return interviews.filter(iv => iv.interviewDecision === "reject")
    case "stage_decision": return interviews.filter(iv => iv.candidateStage === DECISION_STAGE_SLUG)
  }
}
