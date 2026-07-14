// Юнит-тесты фильтрации кастомных стадий интервью (задача 13.07, 1a/1b).
// Запуск: pnpm exec tsx --test lib/interviews/stage-filters.test.ts

import { test } from "node:test"
import assert from "node:assert/strict"
import { computeRepeatInterviewIds, filterByStageCondition, hideSupersededCancelled, type FilterableInterview, type InterviewDecision } from "./stage-filters"

function iv(id: string, candidateId: string | null, dateStr: string, status = "Подтверждено", interviewDecision: InterviewDecision = null, endStr?: string): FilterableInterview {
  return { id, candidateId, date: new Date(dateStr), endAt: endStr ? new Date(endStr) : undefined, status, interviewDecision }
}

test("computeRepeatInterviewIds: у кандидата с 1 интервью повторных нет", () => {
  const list = [iv("a", "cand-1", "2026-07-01T10:00:00")]
  const repeats = computeRepeatInterviewIds(list)
  assert.equal(repeats.size, 0)
})

test("computeRepeatInterviewIds: у кандидата с 3 интервью первое НЕ повторное, остальные — повторные", () => {
  const list = [
    iv("c", "cand-1", "2026-07-03T10:00:00"),
    iv("a", "cand-1", "2026-07-01T10:00:00"),
    iv("b", "cand-1", "2026-07-02T10:00:00"),
  ]
  const repeats = computeRepeatInterviewIds(list)
  assert.deepEqual([...repeats].sort(), ["b", "c"])
})

test("computeRepeatInterviewIds: интервью без candidateId никогда не повторные", () => {
  const list = [
    iv("a", null, "2026-07-01T10:00:00"),
    iv("b", null, "2026-07-02T10:00:00"),
  ]
  const repeats = computeRepeatInterviewIds(list)
  assert.equal(repeats.size, 0)
})

test("computeRepeatInterviewIds: разные кандидаты не смешиваются", () => {
  const list = [
    iv("a1", "cand-1", "2026-07-01T10:00:00"),
    iv("a2", "cand-1", "2026-07-02T10:00:00"),
    iv("b1", "cand-2", "2026-07-01T10:00:00"),
  ]
  const repeats = computeRepeatInterviewIds(list)
  assert.deepEqual([...repeats], ["a2"])
})

test("filterByStageCondition: manual без назначений не пропускает никого (было — баг: возвращало всё)", () => {
  const list = [iv("a", "cand-1", "2026-07-01T10:00:00"), iv("b", "cand-2", "2026-07-02T10:00:00")]
  const result = filterByStageCondition(list, "manual", {})
  assert.equal(result.length, 0)
})

test("filterByStageCondition: manual пропускает только помеченные вручную", () => {
  const list = [iv("a", "cand-1", "2026-07-01T10:00:00"), iv("b", "cand-2", "2026-07-02T10:00:00")]
  const result = filterByStageCondition(list, "manual", { manualIds: new Set(["b"]) })
  assert.deepEqual(result.map(x => x.id), ["b"])
})

test("filterByStageCondition: repeat_interview делегирует в computeRepeatInterviewIds", () => {
  const list = [
    iv("a", "cand-1", "2026-07-01T10:00:00"),
    iv("b", "cand-1", "2026-07-02T10:00:00"),
    iv("c", "cand-2", "2026-07-01T10:00:00"),
  ]
  const result = filterByStageCondition(list, "repeat_interview")
  assert.deepEqual(result.map(x => x.id), ["b"])
})

test("filterByStageCondition: outcome_passed пропускает interviewDecision advance/offer", () => {
  const list = [
    iv("a", "cand-1", "2026-07-01T10:00:00", "Подтверждено", "advance"),
    iv("b", "cand-2", "2026-07-01T10:00:00", "Подтверждено", "offer"),
    iv("c", "cand-3", "2026-07-01T10:00:00", "Подтверждено", "reject"),
    iv("d", "cand-4", "2026-07-01T10:00:00", "Подтверждено", "reserve"),
  ]
  const result = filterByStageCondition(list, "outcome_passed")
  assert.deepEqual(result.map(x => x.id).sort(), ["a", "b"])
})

test("filterByStageCondition: outcome_passed без отметки исхода ничего не пропускает", () => {
  const list = [iv("a", "cand-1", "2026-07-01T10:00:00")]
  const result = filterByStageCondition(list, "outcome_passed")
  assert.equal(result.length, 0)
})

test("filterByStageCondition: status_cancelled включает и «Отменено», и «Не явился»", () => {
  const list = [
    iv("a", "cand-1", "2026-07-01T10:00:00", "Отменено"),
    iv("b", "cand-2", "2026-07-01T10:00:00", "Не явился"),
    iv("c", "cand-3", "2026-07-01T10:00:00", "Подтверждено"),
  ]
  const result = filterByStageCondition(list, "status_cancelled")
  assert.deepEqual(result.map(x => x.id).sort(), ["a", "b"])
})

test("filterByStageCondition: date_after = начнётся позже сейчас (startAt > now)", () => {
  const now = new Date()
  const futureToday = new Date(now.getTime() + 2 * 3600 * 1000)
  const pastToday = new Date(now.getTime() - 2 * 3600 * 1000)
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1)
  const list = [
    iv("futureToday", "cand-1", futureToday.toISOString()),
    iv("pastToday", "cand-2", pastToday.toISOString()),
    iv("tomorrow", "cand-3", tomorrow.toISOString()),
  ]
  const result = filterByStageCondition(list, "date_after")
  assert.deepEqual(result.map(x => x.id).sort(), ["futureToday", "tomorrow"])
})

test("filterByStageCondition: идущее сейчас — в «Сегодня», завершившееся — в «Прошедшие»", () => {
  const now = new Date()
  // Идёт прямо сейчас: началось час назад, закончится через час.
  const ongoing = iv("ongoing", "c1", new Date(now.getTime() - 3600_000).toISOString(), "Подтверждено", null, new Date(now.getTime() + 3600_000).toISOString())
  // Завершилось: началось 2ч назад, закончилось час назад.
  const ended = iv("ended", "c2", new Date(now.getTime() - 2 * 3600_000).toISOString(), "Пройдено", null, new Date(now.getTime() - 3600_000).toISOString())
  const list = [ongoing, ended]
  assert.deepEqual(filterByStageCondition(list, "date_today").map(x => x.id), ["ongoing"])
  assert.deepEqual(filterByStageCondition(list, "date_before").map(x => x.id), ["ended"])
})

test("filterByStageCondition: активные табы (date_*) исключают «Отменено»", () => {
  const now = new Date()
  const today = new Date(now); today.setHours(23, 0, 0, 0)
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1)
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1)
  const listFuture = [
    iv("ok", "cand-1", tomorrow.toISOString(), "Подтверждено"),
    iv("cancelled", "cand-2", tomorrow.toISOString(), "Отменено"),
  ]
  assert.deepEqual(filterByStageCondition(listFuture, "date_after").map(x => x.id), ["ok"])
  assert.deepEqual(
    filterByStageCondition([iv("t", "c", today.toISOString(), "Отменено")], "date_today").map(x => x.id),
    [],
  )
  // «Не явился» — прошедший исход, из «Прошедшие» его НЕ прячем.
  const listPast = [
    iv("noshow", "cand-3", yesterday.toISOString(), "Не явился"),
    iv("cancelledPast", "cand-4", yesterday.toISOString(), "Отменено"),
  ]
  assert.deepEqual(filterByStageCondition(listPast, "date_before").map(x => x.id), ["noshow"])
})

test("hideSupersededCancelled: скрывает отменённое при более позднем активном интервью", () => {
  const list = [
    iv("old-cancelled", "cand-1", "2026-07-01T10:00:00", "Отменено"),
    iv("new-active", "cand-1", "2026-07-05T10:00:00", "Подтверждено"),
  ]
  const result = hideSupersededCancelled(list)
  assert.deepEqual(result.map(x => x.id).sort(), ["new-active"])
})

test("hideSupersededCancelled: НЕ скрывает отменённое, если активное раньше или его нет", () => {
  // Активное РАНЬШЕ отменённого — отменённое остаётся (не перезаписался вперёд).
  const earlierActive = [
    iv("active", "cand-1", "2026-07-01T10:00:00", "Подтверждено"),
    iv("cancelled", "cand-1", "2026-07-05T10:00:00", "Отменено"),
  ]
  assert.deepEqual(hideSupersededCancelled(earlierActive).map(x => x.id).sort(), ["active", "cancelled"])
  // Нет активного вовсе — отменённое остаётся (живёт в cancelled-табе).
  const onlyCancelled = [iv("c", "cand-2", "2026-07-01T10:00:00", "Отменено")]
  assert.deepEqual(hideSupersededCancelled(onlyCancelled).map(x => x.id), ["c"])
})

test("hideSupersededCancelled: отменённые без candidateId и события других кандидатов не трогает", () => {
  const list = [
    iv("no-cand", null, "2026-07-01T10:00:00", "Отменено"),
    iv("other-active", "cand-2", "2026-07-05T10:00:00", "Подтверждено"),
  ]
  assert.deepEqual(hideSupersededCancelled(list).map(x => x.id).sort(), ["no-cand", "other-active"])
})
