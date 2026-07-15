// Юнит-тесты общего помощника быстрых демо-ссылок (кнопки «Демо 1»…«Демо N»
// в диалоге «Рассылка через hh» и в чате «Написать кандидату»).
// Запуск: pnpm exec tsx --test lib/demo/demo-quick-links.test.ts

import { test } from "node:test"
import assert from "node:assert/strict"
import {
  demoButtonLabel,
  buildDemoLink,
  buildDemoLinkButtons,
  buildCandidatePathLink,
  buildFunnelLinkButtons,
  type DemoButtonBlock,
} from "@/lib/demo/demo-quick-links"

test("demoButtonLabel: одно демо → «Демо», несколько → «Демо N»", () => {
  assert.equal(demoButtonLabel(1, 1), "Демо")
  assert.equal(demoButtonLabel(1, 3), "Демо 1")
  assert.equal(demoButtonLabel(3, 3), "Демо 3")
})

test("buildDemoLink: единый формат /demo/{token}?block=<id>, срезает хвостовой слэш базы", () => {
  assert.equal(
    buildDemoLink("https://company24.pro", "LONGTOKEN", "demo-3"),
    "https://company24.pro/demo/LONGTOKEN?block=demo-3",
  )
  assert.equal(
    buildDemoLink("https://company24.pro/", "LONGTOKEN", "demo-1"),
    "https://company24.pro/demo/LONGTOKEN?block=demo-1",
  )
})

test("buildDemoLinkButtons: N блоков → N кнопок с цифрами, единый формат, disabled по контенту", () => {
  const blocks: DemoButtonBlock[] = [
    { id: "d1", index: 1, hasContent: true },
    { id: "d2", index: 2, hasContent: false },
    { id: "d3", index: 3, hasContent: true },
  ]
  const buttons = buildDemoLinkButtons(blocks, "TOK", "https://company24.pro")
  assert.equal(buttons.length, 3)
  assert.deepEqual(buttons.map((b) => b.label), ["Демо 1", "Демо 2", "Демо 3"])
  assert.deepEqual(buttons.map((b) => b.kind), ["demo1", "demo2", "demo3"])
  assert.deepEqual(buttons.map((b) => b.disabled), [false, true, false])
  // Единый формат ссылки для всех — /demo/{token}?block=<id своего блока>.
  assert.equal(buttons[0].url, "https://company24.pro/demo/TOK?block=d1")
  assert.equal(buttons[2].url, "https://company24.pro/demo/TOK?block=d3")
})

test("buildDemoLinkButtons: один демо-блок → кнопка «Демо» без цифры", () => {
  const buttons = buildDemoLinkButtons(
    [{ id: "only", index: 1, hasContent: true }],
    "TOK",
    "https://company24.pro",
  )
  assert.equal(buttons.length, 1)
  assert.equal(buttons[0].label, "Демо")
  assert.equal(buttons[0].url, "https://company24.pro/demo/TOK?block=only")
})

test("buildCandidatePathLink: {base}/{path}/{token}, срез хвостового слэша", () => {
  assert.equal(buildCandidatePathLink("https://company24.pro", "test", "TOK"), "https://company24.pro/test/TOK")
  assert.equal(buildCandidatePathLink("https://company24.pro/", "schedule", "TOK"), "https://company24.pro/schedule/TOK")
})

test("buildFunnelLinkButtons: демо + все этапы — единый набор в правильном порядке", () => {
  const buttons = buildFunnelLinkButtons(
    [{ id: "d1", index: 1, hasContent: true }, { id: "d2", index: 2, hasContent: false }],
    { hasTest: true, vacancyUrl: "https://hh.ru/vacancy/123", hasSchedule: true },
    "TOK",
    "https://company24.pro",
  )
  assert.deepEqual(buttons.map((b) => b.key), ["demo1", "demo2", "test", "vacancy", "interview"])
  assert.deepEqual(buttons.map((b) => b.label), ["Демо 1", "Демо 2", "Тест", "Вакансия", "Интервью"])
  assert.deepEqual(buttons.map((b) => b.disabled), [false, true, false, false, false])
  assert.equal(buttons.find((b) => b.key === "test")!.url, "https://company24.pro/test/TOK")
  assert.equal(buttons.find((b) => b.key === "vacancy")!.url, "https://hh.ru/vacancy/123")
  assert.equal(buttons.find((b) => b.key === "interview")!.url, "https://company24.pro/schedule/TOK")
})

test("buildFunnelLinkButtons: отсутствующие этапы НЕ добавляются (владелец: «если нет — скрываем»)", () => {
  const buttons = buildFunnelLinkButtons(
    [{ id: "d1", index: 1, hasContent: true }],
    { hasTest: false, vacancyUrl: null, hasSchedule: true },
    "TOK",
    "https://company24.pro",
  )
  // Нет теста и нет hh-вакансии → в наборе только Демо + Интервью.
  // Ключ демо всегда `demo${index}` (метка при одном блоке — «Демо»).
  assert.deepEqual(buttons.map((b) => b.key), ["demo1", "interview"])
  assert.equal(buttons[0].label, "Демо")
})

test("buildFunnelLinkButtons: нет демо и нет этапов → пустой набор (кнопок нет)", () => {
  const buttons = buildFunnelLinkButtons(
    [],
    { hasTest: false, vacancyUrl: null, hasSchedule: false },
    "TOK",
    "https://company24.pro",
  )
  assert.equal(buttons.length, 0)
})
