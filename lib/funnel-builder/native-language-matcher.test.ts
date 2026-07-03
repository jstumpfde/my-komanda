// Юнит-тесты стоп-фактора «Родной язык» (03.07, ПОЛНАЯ КОПИЯ тестов гражданства
// stop-factors-matcher.test.ts, домен = hh resume.language[] level.id==="l1").
// Запуск: pnpm exec tsx --test lib/funnel-builder/native-language-matcher.test.ts
//
// Проверяем через публичный matchStopFactors (matchNativeLanguage не экспортирован).

import { test } from "node:test"
import assert from "node:assert/strict"
import { matchStopFactors, type CandidateStopFactorData } from "./stop-factors-matcher"
import type { VacancyStopFactors } from "@/lib/db/schema"
import { resolveNativeLanguageInput, nativeLanguageCodeLabel } from "./native-languages"

const candidate = (nativeLanguages: string[] | null | undefined): CandidateStopFactorData => ({
  nativeLanguages,
})

const factors = (nativeLanguage: VacancyStopFactors["nativeLanguage"]): VacancyStopFactors => ({
  nativeLanguage,
})

test("allow: родной язык кандидата в allowed → НЕ блокирован", () => {
  const m = matchStopFactors(
    candidate(["rus"]),
    factors({ enabled: true, mode: "allow", allowed: ["rus", "bel"] }),
  )
  assert.equal(m, null)
})

test("allow: родной язык кандидата НЕ в allowed → блокирован", () => {
  const m = matchStopFactors(
    candidate(["eng"]),
    factors({ enabled: true, mode: "allow", allowed: ["rus", "bel"] }),
  )
  assert.ok(m)
  assert.equal(m?.factor, "nativeLanguage")
})

test("allow: кандидат мультиязычный (rus+eng), rus в allowed → НЕ блокирован (хотя бы один совпал)", () => {
  const m = matchStopFactors(
    candidate(["eng", "rus"]),
    factors({ enabled: true, mode: "allow", allowed: ["rus"] }),
  )
  assert.equal(m, null)
})

test("deny: родной язык кандидата в denied → блокирован", () => {
  const m = matchStopFactors(
    candidate(["eng"]),
    factors({ enabled: true, mode: "deny", denied: ["eng", "ger"] }),
  )
  assert.ok(m)
  assert.equal(m?.factor, "nativeLanguage")
})

test("deny: родной язык кандидата НЕ в denied → НЕ блокирован", () => {
  const m = matchStopFactors(
    candidate(["rus"]),
    factors({ enabled: true, mode: "deny", denied: ["eng", "ger"] }),
  )
  assert.equal(m, null)
})

test("deny: кандидат мультиязычный (rus+eng), eng в denied → блокирован (хотя бы один совпал)", () => {
  const m = matchStopFactors(
    candidate(["rus", "eng"]),
    factors({ enabled: true, mode: "deny", denied: ["eng"] }),
  )
  assert.ok(m)
})

test("allow: пустой allowed[] → фактор не действует (не блокирован)", () => {
  const m = matchStopFactors(
    candidate(["eng"]),
    factors({ enabled: true, mode: "allow", allowed: [] }),
  )
  assert.equal(m, null)
})

test("deny: пустой denied[] → фактор не действует (не блокирован)", () => {
  const m = matchStopFactors(
    candidate(["eng"]),
    factors({ enabled: true, mode: "deny", denied: [] }),
  )
  assert.equal(m, null)
})

test("legacy: {enabled:true, allowed:[...]} без поля mode → работает как allow (кандидат не в списке → блокирован)", () => {
  const m = matchStopFactors(
    candidate(["eng"]),
    factors({ enabled: true, allowed: ["rus", "bel"] }),
  )
  assert.ok(m)
  assert.equal(m?.factor, "nativeLanguage")
})

test("legacy: {enabled:true, allowed:[...]} без поля mode → кандидат в списке → НЕ блокирован", () => {
  const m = matchStopFactors(
    candidate(["rus"]),
    factors({ enabled: true, allowed: ["rus", "bel"] }),
  )
  assert.equal(m, null)
})

test("candidate.nativeLanguages = null → фактор не срабатывает (нет данных = пропускаем, не режем вслепую)", () => {
  const m = matchStopFactors(
    candidate(null),
    factors({ enabled: true, mode: "allow", allowed: ["rus"] }),
  )
  assert.equal(m, null)
})

test("candidate.nativeLanguages = undefined → фактор не срабатывает", () => {
  const m = matchStopFactors(
    candidate(undefined),
    factors({ enabled: true, mode: "deny", denied: ["eng"] }),
  )
  assert.equal(m, null)
})

test("candidate.nativeLanguages = [] → фактор не срабатывает (пустой список = нет данных)", () => {
  const m = matchStopFactors(
    candidate([]),
    factors({ enabled: true, mode: "allow", allowed: ["rus"] }),
  )
  assert.equal(m, null)
})

test("factor.enabled=false → фактор не действует даже с непустым списком", () => {
  const m = matchStopFactors(
    candidate(["eng"]),
    factors({ enabled: false, mode: "allow", allowed: ["rus"] }),
  )
  assert.equal(m, null)
})

test("регистронезависимость: candidate код в верхнем регистре всё равно матчится", () => {
  const m = matchStopFactors(
    candidate(["RUS"]),
    factors({ enabled: true, mode: "allow", allowed: ["rus"] }),
  )
  assert.equal(m, null)
})

// ─── Резолвер языков (native-languages.ts) ─────────────────────────────────

test("resolveNativeLanguageInput: код как есть → тот же код в нижнем регистре", () => {
  assert.equal(resolveNativeLanguageInput("rus"), "rus")
  assert.equal(resolveNativeLanguageInput("RUS"), "rus")
})

test("resolveNativeLanguageInput: русское название → код", () => {
  assert.equal(resolveNativeLanguageInput("Английский"), "eng")
  assert.equal(resolveNativeLanguageInput("немецкий"), "ger")
})

test("resolveNativeLanguageInput: неизвестный ввод → сохраняется как есть в нижнем регистре", () => {
  assert.equal(resolveNativeLanguageInput("Klingon"), "klingon")
})

test("resolveNativeLanguageInput: пустая строка → пустая строка", () => {
  assert.equal(resolveNativeLanguageInput("   "), "")
})

test("nativeLanguageCodeLabel: известный код → русское название", () => {
  assert.equal(nativeLanguageCodeLabel("rus"), "Русский")
})

test("nativeLanguageCodeLabel: неизвестный код → код как есть", () => {
  assert.equal(nativeLanguageCodeLabel("xyz"), "xyz")
})
