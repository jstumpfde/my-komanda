// Юнит-тесты детекта staff-preview визита (lib/public/staff-preview.ts).
// Запуск: pnpm exec tsx --test lib/public/staff-preview.test.ts

import { test } from "node:test"
import assert from "node:assert/strict"
import { isStaffPreviewVisit } from "./staff-preview"

test("нет сессии → не staff preview", () => {
  assert.equal(isStaffPreviewVisit(null, "company-1"), false)
  assert.equal(isStaffPreviewVisit(undefined, "company-1"), false)
  assert.equal(isStaffPreviewVisit({ user: null }, "company-1"), false)
})

test("нет целевой компании (owner без vacancyId/companyId) → false", () => {
  assert.equal(
    isStaffPreviewVisit({ user: { companyId: "company-1" } }, null),
    false,
  )
  assert.equal(
    isStaffPreviewVisit({ user: { companyId: "company-1" } }, undefined),
    false,
  )
})

test("сотрудник ДРУГОЙ компании → false (обычный анонимный визит)", () => {
  assert.equal(
    isStaffPreviewVisit({ user: { companyId: "company-2" } }, "company-1"),
    false,
  )
})

test("сотрудник ТОЙ ЖЕ компании → true (staff preview, не создаём кандидата)", () => {
  assert.equal(
    isStaffPreviewVisit({ user: { companyId: "company-1" } }, "company-1"),
    true,
  )
})

test("companyId сессии пуст (onboarding не завершён) → false", () => {
  assert.equal(
    isStaffPreviewVisit({ user: { companyId: null } }, "company-1"),
    false,
  )
})

test("platform admin → true для ЛЮБОЙ компании", () => {
  assert.equal(
    isStaffPreviewVisit(
      { user: { companyId: "company-9", isPlatformAdmin: true } },
      "company-1",
    ),
    true,
  )
  assert.equal(
    isStaffPreviewVisit(
      { user: { companyId: null, isPlatformAdmin: true } },
      "company-1",
    ),
    true,
  )
})
