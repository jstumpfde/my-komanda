// Юнит-тесты стоп-фактора «Гражданство» (UX-переделка allow/deny + континенты).
// Запуск: pnpm exec tsx --test lib/funnel-builder/stop-factors-matcher.test.ts
//
// Проверяем через публичный matchStopFactors (matchCitizenship не экспортирован).

import { test } from "node:test"
import assert from "node:assert/strict"
import { matchStopFactors, type CandidateStopFactorData } from "./stop-factors-matcher"
import type { VacancyStopFactors } from "@/lib/db/schema"

const candidate = (citizenship: string | null | undefined): CandidateStopFactorData => ({
  citizenship,
})

const factors = (citizenship: VacancyStopFactors["citizenship"]): VacancyStopFactors => ({
  citizenship,
})

test("allow: кандидат в allowed → НЕ блокирован", () => {
  const m = matchStopFactors(
    candidate("RU"),
    factors({ enabled: true, mode: "allow", allowed: ["RU", "BY"] }),
  )
  assert.equal(m, null)
})

test("allow: кандидат НЕ в allowed → блокирован", () => {
  const m = matchStopFactors(
    candidate("KZ"),
    factors({ enabled: true, mode: "allow", allowed: ["RU", "BY"] }),
  )
  assert.ok(m)
  assert.equal(m?.factor, "citizenship")
})

test("deny: кандидат в denied → блокирован", () => {
  const m = matchStopFactors(
    candidate("US"),
    factors({ enabled: true, mode: "deny", denied: ["US", "GB"] }),
  )
  assert.ok(m)
  assert.equal(m?.factor, "citizenship")
})

test("deny: кандидат НЕ в denied → НЕ блокирован", () => {
  const m = matchStopFactors(
    candidate("RU"),
    factors({ enabled: true, mode: "deny", denied: ["US", "GB"] }),
  )
  assert.equal(m, null)
})

test("deny с континентом: кандидат из страны континента → блокирован", () => {
  const m = matchStopFactors(
    candidate("DE"), // Германия входит в continent:europe
    factors({ enabled: true, mode: "deny", denied: ["continent:europe"] }),
  )
  assert.ok(m)
  assert.equal(m?.factor, "citizenship")
})

test("deny с континентом СНГ: кандидат из страны СНГ → блокирован", () => {
  const m = matchStopFactors(
    candidate("KZ"),
    factors({ enabled: true, mode: "deny", denied: ["continent:cis"] }),
  )
  assert.ok(m)
})

test("deny с континентом: кандидат НЕ из страны континента → НЕ блокирован", () => {
  const m = matchStopFactors(
    candidate("RU"), // Россия не входит в continent:europe в нашем словаре
    factors({ enabled: true, mode: "deny", denied: ["continent:europe"] }),
  )
  assert.equal(m, null)
})

test("allow: пустой allowed[] → фактор не действует (не блокирован)", () => {
  const m = matchStopFactors(
    candidate("US"),
    factors({ enabled: true, mode: "allow", allowed: [] }),
  )
  assert.equal(m, null)
})

test("deny: пустой denied[] → фактор не действует (не блокирован)", () => {
  const m = matchStopFactors(
    candidate("US"),
    factors({ enabled: true, mode: "deny", denied: [] }),
  )
  assert.equal(m, null)
})

test("legacy: {enabled:true, allowed:[...]} без поля mode → работает как allow (кандидат не в списке → блокирован)", () => {
  const m = matchStopFactors(
    candidate("US"),
    factors({ enabled: true, allowed: ["RU", "BY"] }),
  )
  assert.ok(m)
  assert.equal(m?.factor, "citizenship")
})

test("legacy: {enabled:true, allowed:[...]} без поля mode → кандидат в списке → НЕ блокирован", () => {
  const m = matchStopFactors(
    candidate("RU"),
    factors({ enabled: true, allowed: ["RU", "BY"] }),
  )
  assert.equal(m, null)
})

test("candidate.citizenship = null → фактор не срабатывает (нет данных = пропускаем, консистентно с остальными факторами)", () => {
  const m = matchStopFactors(
    candidate(null),
    factors({ enabled: true, mode: "allow", allowed: ["RU"] }),
  )
  assert.equal(m, null)
})

test("candidate.citizenship = undefined → фактор не срабатывает", () => {
  const m = matchStopFactors(
    candidate(undefined),
    factors({ enabled: true, mode: "deny", denied: ["US"] }),
  )
  assert.equal(m, null)
})

test("factor.enabled=false → фактор не действует даже с непустым списком", () => {
  const m = matchStopFactors(
    candidate("US"),
    factors({ enabled: false, mode: "allow", allowed: ["RU"] }),
  )
  assert.equal(m, null)
})

// ─── Единый текст отказа на весь блок (Юрий 08.07) ──────────────────────────

test("blockText приоритетнее пер-факторного (legacy) текста", () => {
  const m = matchStopFactors(
    candidate("US"),
    {
      rejectionText: "Единый блочный текст",
      citizenship: { enabled: true, mode: "allow", allowed: ["RU"], rejectionText: "Пер-факторный legacy текст" },
    } as VacancyStopFactors,
  )
  assert.ok(m)
  assert.equal(m?.rejectionText, "Единый блочный текст")
})

test("ЮР (ТК РФ): пер-факторный legacy текст НЕ используется — при пустом blockText нейтральный дефолт", () => {
  // Гарантия Юрия 08.07: старый пер-факторный текст (мог раскрывать причину:
  // «принимаем только граждан РФ») больше НИКОГДА не уходит кандидату. Пусто →
  // нейтральный дефолт, а не legacy.
  const m = matchStopFactors(
    candidate("US"),
    {
      citizenship: { enabled: true, mode: "allow", allowed: ["RU"], rejectionText: "принимаем только граждан РФ" },
    } as VacancyStopFactors,
  )
  assert.ok(m)
  assert.notEqual(m?.rejectionText, "принимаем только граждан РФ")
  assert.match(m!.rejectionText, /{{name}}/) // нейтральный дефолт с плейсхолдером
})

test("оба текста пусты → возвращается нейтральный defaultRejection", () => {
  const m = matchStopFactors(
    candidate("US"),
    {
      citizenship: { enabled: true, mode: "allow", allowed: ["RU"] },
    } as VacancyStopFactors,
  )
  assert.ok(m)
  assert.match(m!.rejectionText, /{{name}}/)
})

test("матч по возрасту с blockText → возвращается blockText", () => {
  const m = matchStopFactors(
    { age: 60 },
    {
      rejectionText: "Единый блочный текст для возраста",
      age: { enabled: true, maxAge: 45 },
    } as VacancyStopFactors,
  )
  assert.ok(m)
  assert.equal(m?.factor, "age")
  assert.equal(m?.rejectionText, "Единый блочный текст для возраста")
})
