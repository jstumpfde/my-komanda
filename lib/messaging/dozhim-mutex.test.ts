// Юнит-тесты гейта взаимоисключения дожимов (#61): v2-контур vs legacy-кампания.
// Запуск: pnpm exec tsx --test lib/messaging/dozhim-mutex.test.ts
//
// Правило: касания кандидата идут ровно из ОДНОГО контура.
//   - funnelV2RuntimeEnabled=true  → шлёт только v2 (branch startsWith 'funnelv2:').
//   - funnelV2RuntimeEnabled=false/undefined/null → шлёт только legacy.
// Гейт читает funnelV2RuntimeEnabled НА МОМЕНТ ВЫЗОВА (т.е. вызывающая сторона
// обязана прочитать вакансию заново перед отправкой — это проверяется в
// follow-up/route.ts самим порядком кода, здесь тестируем чистую функцию
// решения и моделируем сценарий «переключили между планированием и отправкой»
// через две последовательные вызовы decideDozhimMutex с разным значением флага.

import { test } from "node:test"
import assert from "node:assert/strict"
import { decideDozhimMutex, isFunnelV2Touch } from "./dozhim-mutex"

test("isFunnelV2Touch: распознаёт v2-ветки по префиксу", () => {
  assert.equal(isFunnelV2Touch("funnelv2:stage-1"), true)
  assert.equal(isFunnelV2Touch("funnelv2:stage-1:opened"), true)
  assert.equal(isFunnelV2Touch("not_opened"), false)
  assert.equal(isFunnelV2Touch("opened_not_finished"), false)
  assert.equal(isFunnelV2Touch("anketa_confirmation"), false)
  assert.equal(isFunnelV2Touch(null), false)
  assert.equal(isFunnelV2Touch(undefined), false)
})

test("v2 включён → v2-касание уходит (allowed)", () => {
  const decision = decideDozhimMutex("funnelv2:demo-stage", true)
  assert.deepEqual(decision, { allowed: true })
})

test("v2 включён → legacy-касание НЕ уходит (пропуск, остаётся pending)", () => {
  const decision = decideDozhimMutex("not_opened", true)
  assert.equal(decision.allowed, false)
  if (!decision.allowed) {
    assert.equal(decision.action, "skip")
    assert.equal(decision.reason, "legacy_superseded_by_v2")
  }
})

test("v2 выключен → legacy-касание уходит (allowed)", () => {
  assert.deepEqual(decideDozhimMutex("not_opened", false), { allowed: true })
  assert.deepEqual(decideDozhimMutex("opened_not_finished", false), { allowed: true })
  // Флаг ещё не задан в БД (старые вакансии, дефолт false в схеме) — тоже legacy.
  assert.deepEqual(decideDozhimMutex("not_opened", undefined), { allowed: true })
  assert.deepEqual(decideDozhimMutex("not_opened", null), { allowed: true })
})

test("v2 выключен → v2-касание НЕ уходит (отменяется как хвост)", () => {
  const decision = decideDozhimMutex("funnelv2:demo-stage", false)
  assert.equal(decision.allowed, false)
  if (!decision.allowed) {
    assert.equal(decision.action, "cancel")
    assert.equal(decision.reason, "v2_runtime_disabled")
  }
})

test("прочие one-off ветки (anketa_confirmation, test_invite, schedule_invite) — тоже legacy-контур", () => {
  // Эти branch не относятся к дожим-цепочке напрямую, но идут через тот же
  // cron/follow-up и таблицу follow_up_messages — при активной v2 должны
  // так же придерживать отправку, чтобы не дублировать v2-касания той же стадии.
  for (const branch of ["anketa_confirmation", "test_invite", "schedule_invite", "second_demo_invite", "test_reminder"]) {
    const decision = decideDozhimMutex(branch, true)
    assert.equal(decision.allowed, false, `branch=${branch} должен придерживаться при v2 активной`)
  }
})

test("переключение тумблера МЕЖДУ планированием и отправкой: гейт проверяется на свежем значении", () => {
  // Сценарий: касание запланировано (создано в БД), пока v2 была выключена —
  // т.е. это legacy-касание. К моменту, когда до него дошла очередь cron/follow-up,
  // HR включил v2. Вызывающая сторона (follow-up/route.ts) обязана прочитать
  // vacancy.funnelV2RuntimeEnabled ЗАНОВО непосредственно перед отправкой (не
  // переиспользовать значение с момента постановки в очередь) — здесь это
  // моделируется явно двумя разными аргументами к одному и тому же branch.
  const branch = "not_opened"

  // Момент планирования: v2 была выключена — с точки зрения планировщика
  // касание валидно.
  const atScheduleTime = false
  assert.deepEqual(decideDozhimMutex(branch, atScheduleTime), { allowed: true })

  // Момент отправки: v2 уже включили — тот же контур обязан пересчитать
  // решение по СВЕЖЕМУ значению и придержать отправку.
  const atSendTime = true
  const finalDecision = decideDozhimMutex(branch, atSendTime)
  assert.equal(finalDecision.allowed, false)
  if (!finalDecision.allowed) {
    assert.equal(finalDecision.action, "skip")
  }
})

test("переключение тумблера в обратную сторону: v2-касание, запланированное при v2=true, отменяется если к отправке v2 выключили", () => {
  const branch = "funnelv2:demo-stage"

  const atScheduleTime = true
  assert.deepEqual(decideDozhimMutex(branch, atScheduleTime), { allowed: true })

  const atSendTime = false
  const finalDecision = decideDozhimMutex(branch, atSendTime)
  assert.equal(finalDecision.allowed, false)
  if (!finalDecision.allowed) {
    assert.equal(finalDecision.action, "cancel")
    assert.equal(finalDecision.reason, "v2_runtime_disabled")
  }
})
