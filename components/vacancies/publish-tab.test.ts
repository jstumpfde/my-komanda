// components/vacancies/publish-tab.test.ts
// Юнит-тесты дефолтных буллетов standalone-лендинга (defaultBlocks/resolveBlocks).
// Баг из landing-publish-tab-backlog.md п.1: буллет «📍 Современный офис …»
// выводился и на полностью удалённых вакансиях (format=remote).
// Запуск: pnpm exec tsx --test components/vacancies/publish-tab.test.ts

import { test } from "node:test"
import assert from "node:assert/strict"
import { defaultBlocks, resolveBlocks, generateFullPageHtml } from "./publish-tab"
import { DEFAULT_BRAND } from "@/lib/branding"

const joined = (blocks: { html: string }[]) => blocks.map(b => b.html).join("")

test("remote: буллета «Современный офис» нет, вместо него — про удалёнку", () => {
  const out = joined(defaultBlocks({ city: "Москва", salaryFrom: 100000, format: "remote" }))
  assert.ok(!out.includes("Современный офис"), `офис не должен упоминаться: ${out}`)
  assert.ok(out.includes("Удалённая работа"), `ожидали буллет про удалёнку: ${out}`)
})

test("remote без города: тоже без офиса", () => {
  const out = joined(defaultBlocks({ salaryFrom: 100000, format: "remote" }))
  assert.ok(!out.includes("Современный офис"), out)
})

test("hybrid: офис остаётся, город в предложном падеже", () => {
  const out = joined(defaultBlocks({ city: "Москва", salaryFrom: 100000, format: "hybrid" }))
  assert.ok(out.includes("Современный офис в Москве"), out)
})

test("office: как раньше — офис с городом", () => {
  const out = joined(defaultBlocks({ city: "Казань", salaryFrom: 100000, format: "office" }))
  assert.ok(out.includes("Современный офис в Казани"), out)
})

test("формат не задан (undefined/null/«»): поведение прежнее — офис показываем", () => {
  for (const format of [undefined, null, ""]) {
    const out = joined(defaultBlocks({ city: "Москва", salaryFrom: 100000, format }))
    assert.ok(out.includes("Современный офис в Москве"), `format=${String(format)}: ${out}`)
  }
})

test("resolveBlocks: дефолты для remote приходят без офиса", () => {
  const out = joined(resolveBlocks(undefined, undefined, { city: "Москва", salaryFrom: 100000, format: "remote" }))
  assert.ok(!out.includes("Современный офис"), out)
  assert.ok(out.includes("Удалённая работа"), out)
})

test("resolveBlocks: свои блоки HR приоритетнее — remote-логика их не трогает", () => {
  const hrBlocks = [{ html: "<div>🏢 Наш собственный офис-лофт</div>" }]
  const out = joined(resolveBlocks(hrBlocks, undefined, { city: "Москва", salaryFrom: 100000, format: "remote" }))
  assert.equal(out, "<div>🏢 Наш собственный офис-лофт</div>")
})

test("generateFullPageHtml: fallback на дефолты (blocks пусты) у remote — без офиса", () => {
  const html = generateFullPageHtml(
    DEFAULT_BRAND,
    { title: "Менеджер", slug: "x", city: "Москва", salaryFrom: 100000, salaryTo: 200000, format: "remote" },
    undefined, undefined, [], undefined,
  )
  assert.ok(!html.includes("Современный офис"), "офис не должен попадать в standalone HTML remote-вакансии")
  assert.ok(html.includes("Удалённая работа"), "ожидали буллет про удалёнку в standalone HTML")
})

test("остальные дефолтные буллеты не задеты (зарплата ×1.5, обучение, рост)", () => {
  const out = joined(defaultBlocks({ city: "Москва", salaryFrom: 100000, format: "remote" }))
  assert.ok(out.includes("Доход от 150"), out)
  assert.ok(out.includes("Обучение и наставник"), out)
  assert.ok(out.includes("Карьерный рост"), out)
})
