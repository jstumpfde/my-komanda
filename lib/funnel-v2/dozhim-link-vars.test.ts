// Юнит-тесты ссылочных переменных дожима (Воронка 3, fix «{{test_link}}
// литералом»): дефолтные шаблоны дожима test/task-стадий используют
// {{test_link}} — рендер касания не должен оставлять литералов.
// Запуск: pnpm exec tsx --test lib/funnel-v2/dozhim-link-vars.test.ts

import { test } from "node:test"
import assert from "node:assert/strict"
import { dozhimLinkVars } from "./dozhim-link-vars"
import { dozhimChainFor, dozhimChainForOpened } from "./types"
import { renderTemplate } from "@/lib/template-renderer"

const BASE = "https://company24.pro"
const TOKEN = "tok123"

test("dozhimLinkVars: test/task → обе ссылки ведут на /test; остальные → demo/test раздельно", () => {
  assert.deepEqual(dozhimLinkVars("test", TOKEN, BASE),
    { demo_link: `${BASE}/test/${TOKEN}`, test_link: `${BASE}/test/${TOKEN}` })
  assert.deepEqual(dozhimLinkVars("task", TOKEN, BASE),
    { demo_link: `${BASE}/test/${TOKEN}`, test_link: `${BASE}/test/${TOKEN}` })
  assert.deepEqual(dozhimLinkVars("demo", TOKEN, BASE),
    { demo_link: `${BASE}/demo/${TOKEN}`, test_link: `${BASE}/test/${TOKEN}` })
  assert.deepEqual(dozhimLinkVars(undefined, TOKEN, BASE),
    { demo_link: `${BASE}/demo/${TOKEN}`, test_link: `${BASE}/test/${TOKEN}` })
})

test("рендер ДЕФОЛТНОЙ цепочки дожима test-стадии — без литералов {{...}}, со ссылкой /test/", () => {
  // Та же цепочка, что строит конструктор/рантайм для test-стадии (пресет
  // standard, ветка «не открыл») — дефолтные шаблоны используют {{test_link}}.
  const chain = dozhimChainFor("standard", "test")
  assert.ok(chain.length > 0, "дефолтная цепочка test-стадии не пуста")
  const vars = {
    name:    "Иван",
    vacancy: "Менеджер по продажам",
    company: "Company24",
    ...dozhimLinkVars("test", TOKEN, BASE),
  }
  for (const touch of chain) {
    const rendered = renderTemplate(touch.text, vars)
    assert.ok(!rendered.includes("{{"), `литерал плейсхолдера в касании: «${rendered}»`)
    assert.ok(!rendered.includes("{"), `неразрешённый плейсхолдер в касании: «${rendered}»`)
  }
  // Хотя бы одно касание зовёт по ссылке — и это /test-URL, не /demo
  const joined = chain.map(t => renderTemplate(t.text, vars)).join("\n")
  assert.ok(joined.includes(`${BASE}/test/${TOKEN}`), "ни одно касание не содержит /test-ссылку")
  assert.ok(!joined.includes(`${BASE}/demo/${TOKEN}`), "дожим test-стадии не должен вести на /demo")
})

test("рендер дефолтной цепочки task-стадии (ветка Б «открыл, не завершил») — без литералов", () => {
  const chain = dozhimChainForOpened("standard", "task")
  const vars = { name: "Иван", vacancy: "Вакансия", company: "К", ...dozhimLinkVars("task", TOKEN, BASE) }
  for (const touch of chain) {
    const rendered = renderTemplate(touch.text, vars)
    assert.ok(!rendered.includes("{{"), `литерал плейсхолдера в касании: «${rendered}»`)
  }
})
