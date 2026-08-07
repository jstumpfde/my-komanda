// Юнит-тесты formatCandidateContextBlock — шаг 1 «чат-бот до конца»: прогресс
// кандидата по воронке (демо/анкета/тест/интервью) в контексте Executor'а, чтобы
// бот не звал проходить заново то, что уже пройдено (боль Юрия: «я уже проходил»).
// Запуск: pnpm exec tsx --test lib/ai/candidate-context.test.ts

import { test } from "node:test"
import assert from "node:assert/strict"
import { formatCandidateContextBlock, type CandidateContext, type CandidateProgress } from "./candidate-context"

function ctx(progress: CandidateProgress | null, extra?: Partial<CandidateContext>): CandidateContext {
  return { resumeSummary: null, stageLabel: null, progress, ...extra }
}

test("нет прогресса и нет резюме/стадии/имени → пустой блок", () => {
  const block = formatCandidateContextBlock(ctx(null), null)
  assert.equal(block, "")
})

test("демо пройдено полностью → явная строка «не предлагать пройти заново»", () => {
  const progress: CandidateProgress = {
    demoPercent: 100, demoCompleted: true, demoLastActive: new Date("2026-08-01T10:00:00Z"),
    anketaFilled: false, testSubmitted: false, testInvited: false, interviewAt: null,
  }
  const block = formatCandidateContextBlock(ctx(progress), null)
  assert.match(block, /Демо-презентация: ПРОЙДЕНА ПОЛНОСТЬЮ — не предлагать пройти заново/)
  assert.match(block, /я уже проходил\/сдавал/)
  assert.match(block, /Внутренние оценки\/баллы.*НЕ раскрывай/)
})

test("демо начато, но не завершено → процент, без «пройдена заново»", () => {
  const progress: CandidateProgress = {
    demoPercent: 40, demoCompleted: false, demoLastActive: new Date("2026-08-01T10:00:00Z"),
    anketaFilled: false, testSubmitted: false, testInvited: false, interviewAt: null,
  }
  const block = formatCandidateContextBlock(ctx(progress), null)
  assert.match(block, /Демо-презентация: начата, пройдено ~40%/)
  assert.doesNotMatch(block, /ПРОЙДЕНА ПОЛНОСТЬЮ/)
})

test("анкета заполнена → строка «не просить заполнить повторно»", () => {
  const progress: CandidateProgress = {
    demoPercent: null, demoCompleted: false, demoLastActive: null,
    anketaFilled: true, testSubmitted: false, testInvited: false, interviewAt: null,
  }
  const block = formatCandidateContextBlock(ctx(progress), null)
  assert.match(block, /Анкета: уже заполнена — не просить заполнить повторно/)
})

test("тест сдан → «уже отправлено кандидатом (сдано)», testInvited игнорируется", () => {
  const progress: CandidateProgress = {
    demoPercent: null, demoCompleted: false, demoLastActive: null,
    anketaFilled: false, testSubmitted: true, testInvited: false, interviewAt: null,
  }
  const block = formatCandidateContextBlock(ctx(progress), null)
  assert.match(block, /Тестовое задание: уже отправлено кандидатом \(сдано\)/)
  assert.doesNotMatch(block, /ответа пока нет/)
})

test("тест отправлен, но не сдан → «отправлено, ответа пока нет»", () => {
  const progress: CandidateProgress = {
    demoPercent: null, demoCompleted: false, demoLastActive: null,
    anketaFilled: false, testSubmitted: false, testInvited: true, interviewAt: null,
  }
  const block = formatCandidateContextBlock(ctx(progress), null)
  assert.match(block, /Тестовое задание: отправлено кандидату, ответа пока нет/)
})

test("назначено интервью → дата в блоке, «повторно не предлагать»", () => {
  const progress: CandidateProgress = {
    demoPercent: null, demoCompleted: false, demoLastActive: null,
    anketaFilled: false, testSubmitted: false, testInvited: false,
    interviewAt: new Date("2026-08-10T13:00:00Z"),
  }
  const block = formatCandidateContextBlock(ctx(progress), null)
  assert.match(block, /Интервью: назначено на .* — уже согласовано, повторно не предлагать/)
})

test("ничего не пройдено (все false/null) → блок прогресса не появляется вовсе", () => {
  const progress: CandidateProgress = {
    demoPercent: null, demoCompleted: false, demoLastActive: null,
    anketaFilled: false, testSubmitted: false, testInvited: false, interviewAt: null,
  }
  const block = formatCandidateContextBlock(ctx(progress), null)
  assert.equal(block, "")
})

test("резюме без прогресса всё равно формирует блок «О собеседнике»", () => {
  const block = formatCandidateContextBlock(ctx(null, { resumeSummary: "Опыт: ~5 лет" }), null)
  assert.match(block, /О СОБЕСЕДНИКЕ/)
  assert.match(block, /Краткое резюме:\nОпыт: ~5 лет/)
})
