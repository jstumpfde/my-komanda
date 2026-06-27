// Тесты унифицированного дожима на переменных (бриф 27.06).
// Запуск: pnpm exec tsx --test lib/funnel-v2/dozhim-templates.test.ts

import { test } from "node:test"
import assert from "node:assert/strict"
import { buildDozhimChain } from "./dozhim-templates"

const noStepVarsLeft = (touches: { text: string }[]) =>
  touches.every(t => !t.text.includes("{{step_"))

test("demo ветка А (standard=7 касаний): обзор/посмотрите/время/demo_link, без {{step_*}}", () => {
  const ch = buildDozhimChain("demo", "standard", "A")
  assert.equal(ch.length, 7)
  assert.ok(ch[0].text.includes("обзор"))
  assert.ok(ch[0].text.includes("посмотрите"))
  assert.ok(ch[0].text.includes("5–7 минут"))
  assert.ok(ch[0].text.includes("{{demo_link}}"))
  assert.ok(noStepVarsLeft(ch))
})

test("test ветка Б: тест/завершите/test_link", () => {
  const ch = buildDozhimChain("test", "standard", "B")
  assert.ok(ch.length > 0)
  assert.ok(ch.some(t => t.text.includes("тест")))
  assert.ok(ch.some(t => t.text.includes("завершите")))
  assert.ok(ch.every(t => t.text.includes("{{test_link}}")))
  assert.ok(noStepVarsLeft(ch))
})

test("anketa-подобный (task) ветка А: задание/выполните; ветка Б: доделайте", () => {
  const a = buildDozhimChain("task", "standard", "A")
  const b = buildDozhimChain("task", "standard", "B")
  assert.ok(a.some(t => t.text.includes("задание") && t.text.includes("выполните")))
  assert.ok(b.some(t => t.text.includes("доделайте")))
})

test("interview (живой этап): ветка Б пустая (verb_done=null)", () => {
  assert.equal(buildDozhimChain("interview", "standard", "B").length, 0)
})

test("interview ветка А: использует живые шаблоны (подтвердите/удобное время)", () => {
  const ch = buildDozhimChain("interview", "standard", "A")
  assert.ok(ch.length > 0)
  assert.ok(ch.some(t => t.text.includes("подтвердите") || t.text.includes("удобн")))
  assert.ok(noStepVarsLeft(ch))
})

test("offer: отдельный блок без ссылки/переменных; ветка Б пустая", () => {
  const a = buildDozhimChain("offer", "standard", "A")
  assert.ok(a.length > 0)
  assert.ok(a.some(t => t.text.includes("предложение") || t.text.includes("оффер")))
  assert.ok(a.every(t => !t.text.includes("{{step_") && !t.text.includes("{{demo_link}}")))
  assert.equal(buildDozhimChain("offer", "standard", "B").length, 0)
})

test("preset=off → пусто; soft=5, standard=7, aggressive(strong)=9", () => {
  assert.equal(buildDozhimChain("demo", "off", "A").length, 0)
  assert.equal(buildDozhimChain("demo", "soft", "A").length, 5)
  assert.equal(buildDozhimChain("demo", "standard", "A").length, 7)
  assert.equal(buildDozhimChain("demo", "strong", "A").length, 9)
})

test("неизвестный этап → fallback (demo)", () => {
  const ch = buildDozhimChain("security_check" as never, "standard", "A")
  assert.ok(ch.length > 0)
  assert.ok(noStepVarsLeft(ch))
})
