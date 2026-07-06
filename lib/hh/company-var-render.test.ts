// Юнит-тест инварианта, закрытого этой веткой (fix/company-var-and-baseurl):
// {{company}} в текстах, которые process-queue шлёт кандидату (стоп-фактор
// отказ + легаси-приглашение), должен рендериться РЕАЛЬНЫМ именем компании,
// а не строковым литералом "Company24". Литерал "Company24" остаётся только
// как самый последний fallback, когда имя компании реально не найдено в БД.
//
// Запуск: pnpm exec tsx --test lib/hh/company-var-render.test.ts

import { test } from "node:test"
import assert from "node:assert/strict"
import { renderTemplate } from "@/lib/template-renderer"

// Симулирует ровно то, что делает process-queue.ts: строит переменные
// рендера с companyNameForVars (резолвится один раз на прогон очереди из
// companies.name, кэш) и рендерит шаблон приглашения/отказа.
function renderCandidateMessage(tpl: string, opts: { name: string; vacancy: string; companyNameForVars: string }) {
  return renderTemplate(tpl, {
    name:    opts.name,
    vacancy: opts.vacancy,
    company: opts.companyNameForVars,
  })
}

test("{{company}} с реальным именем компании — не уходит литерал 'Company24'", () => {
  const tpl = "{{name}}, спасибо за отклик на «{{vacancy}}» в {{company}}."
  const out = renderCandidateMessage(tpl, {
    name: "Иван",
    vacancy: "Менеджер по продажам",
    companyNameForVars: "ИП Штумпф",
  })
  assert.ok(!out.includes("Company24"), `литерал "Company24" утёк в текст: «${out}»`)
  assert.ok(out.includes("ИП Штумпф"), `реальное имя компании не подставилось: «${out}»`)
  assert.equal(out, "Иван, спасибо за отклик на «Менеджер по продажам» в ИП Штумпф.")
})

test("другая компания в том же прогоне — своё имя, не имя первой компании (нет утечки между вакансиями)", () => {
  const tpl = "Вакансия в {{company}}"
  const out1 = renderCandidateMessage(tpl, { name: "Иван", vacancy: "V1", companyNameForVars: "ИП Штумпф" })
  const out2 = renderCandidateMessage(tpl, { name: "Пётр", vacancy: "V2", companyNameForVars: "Орлинк" })
  assert.equal(out1, "Вакансия в ИП Штумпф")
  assert.equal(out2, "Вакансия в Орлинк")
})

test("companyNameForVars не нашли в БД → fallback 'Company24' (последний резерв, НЕ пустая строка)", () => {
  // Воспроизводит инициализацию companyNameForVars в process-queue.ts:
  // let companyNameForVars = "Company24"; if (companyRow?.name?.trim()) companyNameForVars = ...
  let companyNameForVars = "Company24"
  // Через функцию, а не const-литерал undefined — иначе TS сужает тип до
  // undefined и обращение к .name становится never (гвард 06.07).
  const findCompanyRow = (): { name: string | null } | undefined => undefined
  const companyRow = findCompanyRow()
  if (companyRow?.name?.trim()) companyNameForVars = companyRow.name.trim()

  const out = renderCandidateMessage("{{name}} / {{company}}", {
    name: "Иван",
    vacancy: "",
    companyNameForVars,
  })
  assert.equal(out, "Иван / Company24")
})

test("companyNameForVars = пустая/пробельная строка в БД → тоже fallback 'Company24' (не пустая строка кандидату)", () => {
  let companyNameForVars = "Company24"
  const companyRow = { name: "   " }
  if (companyRow?.name?.trim()) companyNameForVars = companyRow.name.trim()

  assert.equal(companyNameForVars, "Company24")
  const out = renderCandidateMessage("{{company}}", { name: "", vacancy: "", companyNameForVars })
  assert.equal(out, "Company24")
})

test("реальное имя компании с пробелами обрезается (.trim()) перед подстановкой", () => {
  let companyNameForVars = "Company24"
  const companyRow = { name: "  Ромашка ООО  " }
  if (companyRow?.name?.trim()) companyNameForVars = companyRow.name.trim()

  assert.equal(companyNameForVars, "Ромашка ООО")
  const out = renderCandidateMessage("{{company}}", { name: "", vacancy: "", companyNameForVars })
  assert.equal(out, "Ромашка ООО")
})
