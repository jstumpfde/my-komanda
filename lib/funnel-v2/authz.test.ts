// Юнит-тесты авторизации записи Воронки v2 (фикс owner-gate 13.07).
// Инвариант: стадии/config пишет любой пользователь компании; ВКЛючение
// рантайма движка (runtimeEnabled: true) — только owner-email.
// Запуск: pnpm exec tsx --test lib/funnel-v2/authz.test.ts

import { test } from "node:test"
import assert from "node:assert/strict"
import { canApplyFunnelV2Update } from "./authz"

// OWNER_EMAILS = ["j.stumpf@yandex.ru", "j.stumpf@yandex.by"] (lib/owner.ts)
const OWNER = "j.stumpf@yandex.ru"
const NON_OWNER = "director@company24.pro" // директор компании, но не владелец платформы

test("не-владелец МОЖЕТ писать config (runtimeEnabled не передан)", () => {
  assert.equal(canApplyFunnelV2Update(NON_OWNER, undefined), true)
})

test("не-владелец МОЖЕТ выключить рантайм (runtimeEnabled: false)", () => {
  assert.equal(canApplyFunnelV2Update(NON_OWNER, false), true)
})

test("не-владелец НЕ может включить рантайм (runtimeEnabled: true) → запрет", () => {
  assert.equal(canApplyFunnelV2Update(NON_OWNER, true), false)
})

test("владелец МОЖЕТ включить рантайм (runtimeEnabled: true)", () => {
  assert.equal(canApplyFunnelV2Update(OWNER, true), true)
})

test("владелец МОЖЕТ всё (config без runtimeEnabled и выключение)", () => {
  assert.equal(canApplyFunnelV2Update(OWNER, undefined), true)
  assert.equal(canApplyFunnelV2Update(OWNER, false), true)
})

test("второй owner-аккаунт (yandex.by) тоже может включить рантайм", () => {
  assert.equal(canApplyFunnelV2Update("j.stumpf@yandex.by", true), true)
})

test("пустой/отсутствующий email не может включить рантайм", () => {
  assert.equal(canApplyFunnelV2Update(null, true), false)
  assert.equal(canApplyFunnelV2Update(undefined, true), false)
  assert.equal(canApplyFunnelV2Update("", true), false)
  // но правку стадий такой случай не касается — это отдельный гейт requireCompany
  assert.equal(canApplyFunnelV2Update(null, undefined), true)
})

test("email нормализуется по регистру/пробелам (как isOwnerEmail)", () => {
  assert.equal(canApplyFunnelV2Update("  J.Stumpf@Yandex.RU ", true), true)
})
