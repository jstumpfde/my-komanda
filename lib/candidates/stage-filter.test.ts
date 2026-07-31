// Юнит-тесты splitFunnelStatusSlugs (14.07, задачи 2+3 — фильтр «Статус в
// воронке» списка кандидатов, синтетические слуги preliminary_reject/manual_review).
// Запуск: pnpm exec tsx --test lib/candidates/stage-filter.test.ts

import { test } from "node:test"
import assert from "node:assert/strict"
import { splitFunnelStatusSlugs } from "./stage-filter"

test("пустой список → нет обычных стадий, оба флага false", () => {
  const r = splitFunnelStatusSlugs([])
  assert.deepEqual(r.plainStages, [])
  assert.equal(r.wantsPreliminaryReject, false)
  assert.equal(r.wantsManualReview, false)
})

test("обычные стадии без синтетических слугов проходят как есть", () => {
  const r = splitFunnelStatusSlugs(["new", "interview", "hired"])
  assert.deepEqual(r.plainStages, ["new", "interview", "hired"])
  assert.equal(r.wantsPreliminaryReject, false)
  assert.equal(r.wantsManualReview, false)
})

test("preliminary_reject вынимается из обычных стадий, флаг true", () => {
  const r = splitFunnelStatusSlugs(["interview", "preliminary_reject"])
  assert.deepEqual(r.plainStages, ["interview"])
  assert.equal(r.wantsPreliminaryReject, true)
  assert.equal(r.wantsManualReview, false)
})

test("manual_review вынимается из обычных стадий, флаг true", () => {
  const r = splitFunnelStatusSlugs(["new", "manual_review"])
  assert.deepEqual(r.plainStages, ["new"])
  assert.equal(r.wantsPreliminaryReject, false)
  assert.equal(r.wantsManualReview, true)
})

test("оба синтетических слуга одновременно + обычные стадии", () => {
  const r = splitFunnelStatusSlugs(["demo_opened", "preliminary_reject", "manual_review", "rejected"])
  assert.deepEqual(r.plainStages, ["demo_opened", "rejected"])
  assert.equal(r.wantsPreliminaryReject, true)
  assert.equal(r.wantsManualReview, true)
})

test("только синтетические слуги — plainStages пуст", () => {
  const r = splitFunnelStatusSlugs(["preliminary_reject", "manual_review"])
  assert.deepEqual(r.plainStages, [])
  assert.equal(r.wantsPreliminaryReject, true)
  assert.equal(r.wantsManualReview, true)
})

test("legacy-стадии вне PLATFORM_STAGES (talent_pool/pending/preboarding) проходят как обычные — сервер фильтрует их плоским equality/inArray", () => {
  const r = splitFunnelStatusSlugs(["talent_pool", "pending", "preboarding"])
  assert.deepEqual(r.plainStages, ["talent_pool", "pending", "preboarding"])
  assert.equal(r.wantsPreliminaryReject, false)
  assert.equal(r.wantsManualReview, false)
})
