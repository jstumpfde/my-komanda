// Юнит-тесты моста конструктор ⇄ боевое хранилище стоп-факторов
// (инцидент 07.07, вакансия 2604V023 — конструктор писал в отдельный
// нерантаймовый карман descriptionJson.anketa.stopFactors).
// Запуск: pnpm exec tsx --test lib/funnel-builder/anketa-stop-factors-bridge.test.ts

import { test } from "node:test"
import assert from "node:assert/strict"
import type { VacancyStopFactors } from "@/lib/db/schema"
import {
  toAnketaStopFactors,
  fromAnketaStopFactors,
  defaultAnketaStopFactors,
  countEnabledAnketaStopFactors,
  describeStopFactorsForPrompt,
  ANKETA_STOP_FACTOR_IDS,
  type AnketaStopFactor,
} from "./anketa-stop-factors-bridge"

// ─── defaultAnketaStopFactors ────────────────────────────────────────────────

test("defaultAnketaStopFactors: все 7 факторов, все выключены, age имеет диапазон 18-65", () => {
  const d = defaultAnketaStopFactors()
  assert.equal(d.length, ANKETA_STOP_FACTOR_IDS.length)
  assert.ok(d.every(f => f.enabled === false))
  const age = d.find(f => f.id === "age")
  assert.deepEqual(age?.ageRange, [18, 65])
})

// ─── toAnketaStopFactors: боевое → конструктор ───────────────────────────────

test("toAnketaStopFactors: пустое боевое → полный набор выключенных факторов", () => {
  const d = toAnketaStopFactors(null)
  assert.equal(d.length, ANKETA_STOP_FACTOR_IDS.length)
  assert.ok(d.every(f => f.enabled === false))
})

test("toAnketaStopFactors: age enabled с диапазоном", () => {
  const boevoe: VacancyStopFactors = { age: { enabled: true, minAge: 22, maxAge: 35 } }
  const d = toAnketaStopFactors(boevoe)
  const age = d.find(f => f.id === "age")
  assert.equal(age?.enabled, true)
  assert.deepEqual(age?.ageRange, [22, 35])
})

test("toAnketaStopFactors: age enabled без границ → дефолтный диапазон 18-65", () => {
  const boevoe: VacancyStopFactors = { age: { enabled: true } }
  const d = toAnketaStopFactors(boevoe)
  const age = d.find(f => f.id === "age")
  assert.deepEqual(age?.ageRange, [18, 65])
})

test("toAnketaStopFactors: experience → value строкой", () => {
  const boevoe: VacancyStopFactors = { experience: { enabled: true, minYears: 3 } }
  const d = toAnketaStopFactors(boevoe)
  const exp = d.find(f => f.id === "experience")
  assert.equal(exp?.enabled, true)
  assert.equal(exp?.value, "3")
})

test("toAnketaStopFactors: citizenship allow-режим → CSV строк", () => {
  const boevoe: VacancyStopFactors = {
    citizenship: { enabled: true, mode: "allow", allowed: ["RU", "BY"] },
  }
  const d = toAnketaStopFactors(boevoe)
  const cit = d.find(f => f.id === "citizenship")
  assert.equal(cit?.enabled, true)
  assert.equal(cit?.value, "RU, BY")
})

test("toAnketaStopFactors: citizenship deny-режим → текст с «Кроме:»", () => {
  const boevoe: VacancyStopFactors = {
    citizenship: { enabled: true, mode: "deny", denied: ["US", "GB"] },
  }
  const d = toAnketaStopFactors(boevoe)
  const cit = d.find(f => f.id === "citizenship")
  assert.equal(cit?.value, "Кроме: US, GB")
})

test("toAnketaStopFactors: city → CSV городов", () => {
  const boevoe: VacancyStopFactors = {
    city: { enabled: true, allowedCities: ["Москва", "Санкт-Петербург"] },
  }
  const d = toAnketaStopFactors(boevoe)
  const city = d.find(f => f.id === "city")
  assert.equal(city?.value, "Москва, Санкт-Петербург")
})

test("toAnketaStopFactors: format → русские метки через запятую", () => {
  const boevoe: VacancyStopFactors = {
    format: { enabled: true, allowedFormats: ["office", "remote"] },
  }
  const d = toAnketaStopFactors(boevoe)
  const format = d.find(f => f.id === "format")
  assert.equal(format?.value, "Офис, Удалёнка")
})

test("toAnketaStopFactors: salaryExpectation → salaryMax value", () => {
  const boevoe: VacancyStopFactors = {
    salaryExpectation: { enabled: true, maxAmount: 150000 },
  }
  const d = toAnketaStopFactors(boevoe)
  const salary = d.find(f => f.id === "salaryMax")
  assert.equal(salary?.enabled, true)
  assert.equal(salary?.value, "150000")
})

test("toAnketaStopFactors: documents ВСЕГДА enabled:false (не участвует в боевом матчере)", () => {
  const boevoe: VacancyStopFactors = {
    documents: { enabled: true, required: ["med_book"] },
  }
  const d = toAnketaStopFactors(boevoe)
  const docs = d.find(f => f.id === "documents")
  assert.equal(docs?.enabled, false)
})

// ─── fromAnketaStopFactors: конструктор → боевое ─────────────────────────────

test("fromAnketaStopFactors: age → minAge/maxAge из ageRange", () => {
  const factors: AnketaStopFactor[] = [
    { id: "age", label: "Возраст", enabled: true, ageRange: [22, 35] },
  ]
  const boevoe = fromAnketaStopFactors(factors)
  assert.deepEqual(boevoe.age, { enabled: true, minAge: 22, maxAge: 35 })
})

test("fromAnketaStopFactors: experience → minYears из value", () => {
  const factors: AnketaStopFactor[] = [
    { id: "experience", label: "Опыт", enabled: true, value: "3" },
  ]
  const boevoe = fromAnketaStopFactors(factors)
  assert.deepEqual(boevoe.experience, { enabled: true, minYears: 3 })
})

test("fromAnketaStopFactors: citizenship CSV → allowed[] mode=allow по умолчанию", () => {
  const factors: AnketaStopFactor[] = [
    { id: "citizenship", label: "Гражданство", enabled: true, value: "RU, BY" },
  ]
  const boevoe = fromAnketaStopFactors(factors)
  assert.equal(boevoe.citizenship?.enabled, true)
  assert.equal(boevoe.citizenship?.mode, "allow")
  assert.deepEqual(boevoe.citizenship?.allowed, ["RU", "BY"])
})

// ГВАРД-БЛОКЕР 07.07: deny-режим кодируется в тексте конструктора префиксом
// «Кроме:» (citizenshipToText) — раньше этот текст наивно сплитился в allowed
// (боевое замусоривалось ["Кроме: US","GB"], правки deny-списка не влияли на
// отсев). Ниже — тесты корректного парса deny.

test("fromAnketaStopFactors: citizenship текст «Кроме: …» → denied[], allowed не трогается", () => {
  const factors: AnketaStopFactor[] = [
    { id: "citizenship", label: "Гражданство", enabled: true, value: "Кроме: US, GB" },
  ]
  const boevoe = fromAnketaStopFactors(factors)
  assert.equal(boevoe.citizenship?.enabled, true)
  assert.equal(boevoe.citizenship?.mode, "deny")
  assert.deepEqual(boevoe.citizenship?.denied, ["US", "GB"])
  assert.equal(boevoe.citizenship?.allowed, undefined)
})

test("fromAnketaStopFactors: citizenship deny-режим из current + текст БЕЗ префикса → правка уходит в denied", () => {
  const factors: AnketaStopFactor[] = [
    { id: "citizenship", label: "Гражданство", enabled: true, value: "US, GB" },
  ]
  const current: VacancyStopFactors = { citizenship: { enabled: false, mode: "deny", denied: [], allowed: ["RU"] } }
  const boevoe = fromAnketaStopFactors(factors, current)
  assert.equal(boevoe.citizenship?.mode, "deny")
  assert.deepEqual(boevoe.citizenship?.denied, ["US", "GB"])
  // allowed из current не замусоривается deny-текстом
  assert.deepEqual(boevoe.citizenship?.allowed, ["RU"])
})

test("fromAnketaStopFactors: пользователь отредактировал deny-текст (добавил страну) → правка в denied", () => {
  const current: VacancyStopFactors = {
    citizenship: { enabled: true, mode: "deny", denied: ["US", "GB"] },
  }
  // Гидрация конструктора из боевого → текст «Кроме: US, GB», HR дописал KZ
  const factors = toAnketaStopFactors(current).map(f =>
    f.id === "citizenship" ? { ...f, value: "Кроме: US, GB, KZ" } : f,
  )
  const boevoe = fromAnketaStopFactors(factors, current)
  assert.equal(boevoe.citizenship?.mode, "deny")
  assert.deepEqual(boevoe.citizenship?.denied, ["US", "GB", "KZ"])
  assert.equal(boevoe.citizenship?.allowed, undefined)
})

test("fromAnketaStopFactors: deny + пустой текст → denied из current сохраняется", () => {
  const factors: AnketaStopFactor[] = [
    { id: "citizenship", label: "Гражданство", enabled: true, value: "" },
  ]
  const current: VacancyStopFactors = { citizenship: { enabled: true, mode: "deny", denied: ["US"] } }
  const boevoe = fromAnketaStopFactors(factors, current)
  assert.equal(boevoe.citizenship?.mode, "deny")
  assert.deepEqual(boevoe.citizenship?.denied, ["US"])
})

test("fromAnketaStopFactors: city CSV → allowedCities[]", () => {
  const factors: AnketaStopFactor[] = [
    { id: "city", label: "Город", enabled: true, value: "Москва, Казань" },
  ]
  const boevoe = fromAnketaStopFactors(factors)
  assert.deepEqual(boevoe.city, { enabled: true, allowedCities: ["Москва", "Казань"] })
})

test("fromAnketaStopFactors: format русские метки → office/hybrid/remote", () => {
  const factors: AnketaStopFactor[] = [
    { id: "format", label: "Формат", enabled: true, value: "Офис, Гибрид" },
  ]
  const boevoe = fromAnketaStopFactors(factors)
  assert.deepEqual(boevoe.format, { enabled: true, allowedFormats: ["office", "hybrid"] })
})

test("fromAnketaStopFactors: salaryMax → salaryExpectation.maxAmount", () => {
  const factors: AnketaStopFactor[] = [
    { id: "salaryMax", label: "ЗП макс", enabled: true, value: "200000" },
  ]
  const boevoe = fromAnketaStopFactors(factors)
  assert.deepEqual(boevoe.salaryExpectation, { enabled: true, maxAmount: 200000 })
})

test("fromAnketaStopFactors: documents в input НЕ трогает боевой documents", () => {
  const factors: AnketaStopFactor[] = [
    { id: "documents", label: "Документы", enabled: true },
  ]
  const current: VacancyStopFactors = { documents: { enabled: false, required: ["med_book"] } }
  const boevoe = fromAnketaStopFactors(factors, current)
  assert.deepEqual(boevoe.documents, { enabled: false, required: ["med_book"] })
})

test("fromAnketaStopFactors: MERGE поверх current — сохраняет rejectionText и незатронутые факторы", () => {
  const factors: AnketaStopFactor[] = [
    { id: "age", label: "Возраст", enabled: true, ageRange: [18, 40] },
  ]
  const current: VacancyStopFactors = {
    age: { enabled: false, minAge: 18, maxAge: 65, rejectionText: "Извините" },
    nativeLanguage: { enabled: true, mode: "allow", allowed: ["rus"] },
  }
  const boevoe = fromAnketaStopFactors(factors, current)
  assert.equal(boevoe.age?.rejectionText, "Извините")
  assert.equal(boevoe.age?.enabled, true)
  assert.deepEqual(boevoe.age?.minAge, 18)
  assert.deepEqual(boevoe.age?.maxAge, 40)
  // nativeLanguage не в конструкторе — должен остаться нетронутым
  assert.deepEqual(boevoe.nativeLanguage, { enabled: true, mode: "allow", allowed: ["rus"] })
})

test("fromAnketaStopFactors: пустое value при enabled=true — оставляет фактор включённым, но без параметров", () => {
  const factors: AnketaStopFactor[] = [
    { id: "city", label: "Город", enabled: true, value: "" },
  ]
  const boevoe = fromAnketaStopFactors(factors)
  assert.equal(boevoe.city?.enabled, true)
  assert.deepEqual(boevoe.city?.allowedCities, [])
})

// ─── Round-trip ───────────────────────────────────────────────────────────────

test("round-trip: боевое → конструктор → боевое сохраняет значимые поля (все id)", () => {
  const original: VacancyStopFactors = {
    age:               { enabled: true, minAge: 20, maxAge: 50 },
    experience:        { enabled: true, minYears: 2 },
    citizenship:        { enabled: true, mode: "allow", allowed: ["RU"] },
    city:              { enabled: true, allowedCities: ["Москва"] },
    format:            { enabled: true, allowedFormats: ["remote"] },
    salaryExpectation: { enabled: true, maxAmount: 100000 },
  }
  const asAnketa = toAnketaStopFactors(original)
  const roundTripped = fromAnketaStopFactors(asAnketa)

  assert.equal(roundTripped.age?.enabled, true)
  assert.equal(roundTripped.age?.minAge, 20)
  assert.equal(roundTripped.age?.maxAge, 50)
  assert.equal(roundTripped.experience?.minYears, 2)
  assert.deepEqual(roundTripped.citizenship?.allowed, ["RU"])
  assert.deepEqual(roundTripped.city?.allowedCities, ["Москва"])
  assert.deepEqual(roundTripped.format?.allowedFormats, ["remote"])
  assert.equal(roundTripped.salaryExpectation?.maxAmount, 100000)
})

test("round-trip: citizenship deny стабилен (гидрация + save без правок не меняет боевое)", () => {
  const original: VacancyStopFactors = {
    citizenship: { enabled: true, mode: "deny", denied: ["US", "GB"], rejectionText: "Увы" },
  }
  // Цикл вкладки «Анкета»: гидрация из боевого → save → fromAnketaStopFactors
  const once = fromAnketaStopFactors(toAnketaStopFactors(original), original)
  assert.deepEqual(once.citizenship, original.citizenship)
  // И повторный цикл (каждый следующий save) — тоже стабилен
  const twice = fromAnketaStopFactors(toAnketaStopFactors(once), once)
  assert.deepEqual(twice.citizenship, original.citizenship)
})

// ─── countEnabledAnketaStopFactors ───────────────────────────────────────────

test("countEnabledAnketaStopFactors: считает только enabled:true", () => {
  const factors: AnketaStopFactor[] = [
    { id: "age", label: "Возраст", enabled: true },
    { id: "city", label: "Город", enabled: false },
    { id: "format", label: "Формат", enabled: true },
  ]
  assert.equal(countEnabledAnketaStopFactors(factors), 2)
})

test("countEnabledAnketaStopFactors: null/undefined → 0", () => {
  assert.equal(countEnabledAnketaStopFactors(null), 0)
  assert.equal(countEnabledAnketaStopFactors(undefined), 0)
})

// ─── describeStopFactorsForPrompt ────────────────────────────────────────────

test("describeStopFactorsForPrompt: пусто → пустой массив", () => {
  assert.deepEqual(describeStopFactorsForPrompt(null), [])
  assert.deepEqual(describeStopFactorsForPrompt({}), [])
})

test("describeStopFactorsForPrompt: age enabled без границ игнорируется", () => {
  assert.deepEqual(describeStopFactorsForPrompt({ age: { enabled: true } }), [])
})

test("describeStopFactorsForPrompt: собирает все заданные факторы читаемыми строками", () => {
  const boevoe: VacancyStopFactors = {
    city:              { enabled: true, allowedCities: ["Москва"] },
    format:            { enabled: true, allowedFormats: ["office"] },
    age:               { enabled: true, minAge: 22, maxAge: 35 },
    experience:        { enabled: true, minYears: 3 },
    citizenship:       { enabled: true, mode: "allow", allowed: ["RU"] },
    salaryExpectation: { enabled: true, maxAmount: 150000 },
  }
  const lines = describeStopFactorsForPrompt(boevoe)
  assert.equal(lines.length, 6)
  assert.ok(lines.some(l => l.includes("Москва")))
  assert.ok(lines.some(l => l.includes("Офис")))
  assert.ok(lines.some(l => l.includes("22") && l.includes("35")))
  assert.ok(lines.some(l => l.includes("3 лет")))
  assert.ok(lines.some(l => l.includes("RU")))
  assert.ok(lines.some(l => l.includes("150")))
})

test("describeStopFactorsForPrompt: disabled факторы не попадают в список", () => {
  const boevoe: VacancyStopFactors = {
    city: { enabled: false, allowedCities: ["Москва"] },
  }
  assert.deepEqual(describeStopFactorsForPrompt(boevoe), [])
})
