// Юнит-тесты единого набора переменных ТЕКСТА ОТКАЗА (гвард №4 п.1).
// Инвариант: ни один путь не отправляет кандидату нерендеренный плейсхолдер —
// score-gate (applyFailAction), stage-completion-handler (легаси autoReject) и
// trySyncRejectToHh рендерят ОДНИМ набором rejectMessageVars.
// Запуск: pnpm exec tsx --test lib/funnel-v2/reject-vars.test.ts

import { test } from "node:test"
import assert from "node:assert/strict"
import { rejectMessageVars } from "./reject-vars"
import { renderTemplate } from "@/lib/template-renderer"

const INPUT = {
  firstName:    "Иван",
  vacancyTitle: "Менеджер по продажам",
  companyName:  "Company24",
  token:        "tok123",
  baseUrl:      "https://company24.pro",
}

test("легаси-путь: rejectText с {{company}} → уходит текст БЕЗ литералов", () => {
  // Тот же вызов, что stage-completion-handler делает перед scheduleV2Rejection.
  const raw = "{{name}}, спасибо за интерес к «{{vacancy}}» в {{company}}. К сожалению…"
  const rendered = renderTemplate(raw, rejectMessageVars(INPUT))
  assert.ok(!rendered.includes("{{"), `литерал в тексте отказа: «${rendered}»`)
  assert.ok(rendered.includes("Иван"))
  assert.ok(rendered.includes("Менеджер по продажам"))
  assert.ok(rendered.includes("Company24"))
})

test("все кнопки-плейсхолдеры редактора покрыты переменными (name/vacancy/company)", () => {
  const vars = rejectMessageVars(INPUT)
  for (const key of ["name", "vacancy", "company"]) {
    assert.ok(typeof vars[key] === "string", `нет переменной ${key}`)
  }
  assert.equal(vars.demo_link, "https://company24.pro/demo/tok123")
})

test("пустые вакансия/компания → пустые строки (не литералы); без токена demo_link не собирается", () => {
  const vars = rejectMessageVars({ firstName: "Иван", baseUrl: "https://x", token: null })
  const rendered = renderTemplate("{{name}} / {{vacancy}} / {{company}}", vars)
  assert.equal(rendered, "Иван /  / ")
  assert.equal(vars.demo_link, undefined)
})
