// Юнит-тесты безопасной линкификации URL в сообщениях чата.
// Запуск: pnpm exec tsx --test lib/linkify.test.ts

import { test } from "node:test"
import assert from "node:assert/strict"
import { splitLinkifySegments } from "@/lib/linkify"

test("splitLinkifySegments: текст без URL — один текстовый сегмент", () => {
  const segs = splitLinkifySegments("привет, как дела")
  assert.deepEqual(segs, [{ type: "text", value: "привет, как дела" }])
})

test("splitLinkifySegments: URL внутри текста выделяется отдельным сегментом", () => {
  const segs = splitLinkifySegments("Ссылка: https://company24.pro/demo/AbC1?block=xyz — открой")
  assert.deepEqual(segs, [
    { type: "text", value: "Ссылка: " },
    { type: "url", value: "https://company24.pro/demo/AbC1?block=xyz" },
    { type: "text", value: " — открой" },
  ])
})

test("splitLinkifySegments: хвостовая точка/скобка не входят в URL", () => {
  const segs = splitLinkifySegments("см. https://x.io/demo?block=1.")
  assert.deepEqual(segs, [
    { type: "text", value: "см. " },
    { type: "url", value: "https://x.io/demo?block=1" },
    { type: "text", value: "." },
  ])
})

test("splitLinkifySegments: две ссылки и перенос строки сохраняются в тексте", () => {
  const segs = splitLinkifySegments("a https://one.ru\nb https://two.ru")
  assert.deepEqual(segs, [
    { type: "text", value: "a " },
    { type: "url", value: "https://one.ru" },
    { type: "text", value: "\nb " },
    { type: "url", value: "https://two.ru" },
  ])
})

test("splitLinkifySegments: НЕ линкует не-http (нет XSS-вектора javascript:)", () => {
  const segs = splitLinkifySegments("javascript:alert(1) и mailto:a@b.ru")
  assert.deepEqual(segs, [{ type: "text", value: "javascript:alert(1) и mailto:a@b.ru" }])
})

test("splitLinkifySegments: пустая строка — пусто", () => {
  assert.deepEqual(splitLinkifySegments(""), [])
})
