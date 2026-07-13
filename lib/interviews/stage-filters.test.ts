// Юнит-тесты фильтрации кастомных стадий интервью (задача 13.07, 1a/1b).
// Запуск: pnpm exec tsx --test lib/interviews/stage-filters.test.ts

import { test } from "node:test"
import assert from "node:assert/strict"
import { computeRepeatInterviewIds, filterByStageCondition, type FilterableInterview, type InterviewDecision } from "./stage-filters"

function iv(id: string, candidateId: string | null, dateStr: string, status = "Подтверждено", interviewDecision: InterviewDecision = null): FilterableInterview {
  return { id, candidateId, date: new Date(dateStr), status, interviewDecision }
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

test("filterByStageCondition: date_after включает сегодняшние и будущие", () => {
  const now = new Date()
  const today = new Date(now); today.setHours(23, 0, 0, 0)
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1)
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1)
  const list = [
    iv("today", "cand-1", today.toISOString()),
    iv("yesterday", "cand-2", yesterday.toISOString()),
    iv("tomorrow", "cand-3", tomorrow.toISOString()),
  ]
  const result = filterByStageCondition(list, "date_after")
  assert.deepEqual(result.map(x => x.id).sort(), ["today", "tomorrow"])
})
