// Юнит-тесты резолвера очерёдности ПО ТИПУ СООБЩЕНИЯ (07.07, скрин Юрия).
// Запуск: pnpm exec tsx --test lib/messaging/message-category-order.test.ts
//
// normalizeMessageCategoryOrder / categoryPriorityRank — симметричны
// normalizeSendPriorityOrder / priorityRank для групп кандидатов
// (lib/messaging/send-priority.ts), только для TouchCategory.

import { test } from "node:test"
import assert from "node:assert/strict"
import {
  DEFAULT_MESSAGE_CATEGORY_ORDER,
  normalizeMessageCategoryOrder,
  categoryPriorityRank,
  branchToTouchCategory,
  type TouchCategory,
} from "./touch-window"

test("normalize: null/undefined → дефолтный порядок из 5 категорий", () => {
  assert.deepEqual(normalizeMessageCategoryOrder(null), DEFAULT_MESSAGE_CATEGORY_ORDER)
  assert.deepEqual(normalizeMessageCategoryOrder(undefined), DEFAULT_MESSAGE_CATEGORY_ORDER)
})

test("normalize: не массив → дефолтный порядок (fail-safe)", () => {
  assert.deepEqual(normalizeMessageCategoryOrder("dozhim"), DEFAULT_MESSAGE_CATEGORY_ORDER)
  assert.deepEqual(normalizeMessageCategoryOrder({ dozhim: 1 }), DEFAULT_MESSAGE_CATEGORY_ORDER)
  assert.deepEqual(normalizeMessageCategoryOrder(42), DEFAULT_MESSAGE_CATEGORY_ORDER)
})

test("normalize: пользовательский порядок сохраняется как есть, если содержит все 5 категорий", () => {
  const custom: TouchCategory[] = ["dozhim", "welcome", "thank_you", "confirmation", "invite"]
  assert.deepEqual(normalizeMessageCategoryOrder(custom), custom)
})

test("normalize: неизвестные значения отбрасываются, известные сохраняют порядок", () => {
  const raw = ["dozhim", "unknown_category", "invite", 42, null, "confirmation"]
  const result = normalizeMessageCategoryOrder(raw)
  assert.deepEqual(result, ["dozhim", "invite", "confirmation", "thank_you", "welcome"])
})

test("normalize: дубли схлопываются в первое вхождение", () => {
  const raw = ["welcome", "welcome", "invite", "invite"]
  const result = normalizeMessageCategoryOrder(raw)
  assert.deepEqual(result, ["welcome", "invite", "confirmation", "thank_you", "dozhim"])
})

test("normalize: недостающие категории дополняются в хвост в дефолтном порядке", () => {
  const raw = ["dozhim"]
  const result = normalizeMessageCategoryOrder(raw)
  assert.deepEqual(result, ["dozhim", "invite", "confirmation", "thank_you", "welcome"])
})

test("categoryPriorityRank: индекс в заданном порядке", () => {
  const order: TouchCategory[] = ["dozhim", "invite", "confirmation", "thank_you", "welcome"]
  assert.equal(categoryPriorityRank("dozhim", order), 0)
  assert.equal(categoryPriorityRank("invite", order), 1)
  assert.equal(categoryPriorityRank("welcome", order), 4)
})

test("categoryPriorityRank: неизвестная категория → в конец (длина порядка)", () => {
  const order: TouchCategory[] = ["invite", "confirmation"]
  assert.equal(categoryPriorityRank("dozhim" as TouchCategory, order), 2)
})

test("сортировка по умолчанию: приглашения раньше дожимов (как на скрине Юрия)", () => {
  const order = DEFAULT_MESSAGE_CATEGORY_ORDER
  const rankInvite = categoryPriorityRank("invite", order)
  const rankDozhim = categoryPriorityRank("dozhim", order)
  assert.ok(rankInvite < rankDozhim, "invite должен уходить раньше dozhim по дефолтному порядку")
})

test("branchToTouchCategory + categoryPriorityRank: типовые branch-и ранжируются согласно дефолтному порядку", () => {
  const order = DEFAULT_MESSAGE_CATEGORY_ORDER
  const inviteRank = categoryPriorityRank(branchToTouchCategory("second_demo_invite"), order)
  const confirmationRank = categoryPriorityRank(branchToTouchCategory("anketa_confirmation"), order)
  const thankYouRank = categoryPriorityRank(branchToTouchCategory("anketa_auto_reply"), order)
  const welcomeRank = categoryPriorityRank(branchToTouchCategory("first_msg_2"), order)
  const dozhimRank = categoryPriorityRank(branchToTouchCategory("not_opened"), order)

  assert.ok(inviteRank < confirmationRank)
  assert.ok(confirmationRank < thankYouRank)
  assert.ok(thankYouRank < welcomeRank)
  assert.ok(welcomeRank < dozhimRank)
})
