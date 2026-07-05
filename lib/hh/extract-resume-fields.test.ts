// Юнит-тест на билдер входа AI-Портрета (scoreCandidateV2 → buildResumeText).
// Симптом с прода (04.07): вкладка «Резюме» показывает 5 мест работы с датами
// и достижениями, а AI-Портрет пишет «весь опыт подан единым блоком без
// разбивки по работодателям» — модель не видела структурированный опыт.
// Корень: buildResumeText в lib/ai-score-candidate-v2.ts использовал только
// candidates.experience ("15 лет"), не hh_responses.raw_data.experience[].
// Фикс: extractHhResumeFields(...).workHistory + formatWorkHistory() —
// тот же билдер, что уже использует screenResume (AI-резюме на входе, балл
// адекватный) и scoreResumeByAxes (осевой Портрет).
//
// Запуск: pnpm exec tsx --test lib/hh/extract-resume-fields.test.ts
import { test } from "node:test"
import assert from "node:assert/strict"
import { extractHhResumeFields, formatWorkHistory } from "./extract-resume-fields"

// Сырое hh-резюме с 5 местами работы (как реально приходит из /resumes/{id}).
const rawResumeWith5Jobs = {
  resume: {
    total_experience: { months: 180 }, // 15 лет
    experience: [
      {
        position: "Директор по продажам",
        company: "ООО Ромашка",
        company_industries: [{ name: "Розничная торговля" }],
        start: "2022-01",
        end: null,
        total_months: 30,
        description: "Рост конверсии на 80%, выстроил отдел продаж с нуля.",
      },
      {
        position: "Руководитель отдела продаж",
        company: "АО Вектор",
        company_industries: [{ name: "IT" }],
        start: "2019-03",
        end: "2021-12",
        total_months: 33,
        description: "ROI x3 на маркетинговые кампании, 30+ клиентов B2B.",
      },
      {
        position: "Ведущий менеджер по продажам",
        company: "ЗАО Гамма",
        company_industries: [{ name: "Производство" }],
        start: "2016-06",
        end: "2019-02",
        total_months: 32,
        description: "Обслуживал 10+ ключевых клиентов, выполнение плана 120%.",
      },
      {
        position: "Менеджер по продажам",
        company: "ИП Дельта",
        company_industries: [{ name: "Оптовая торговля" }],
        start: "2013-09",
        end: "2016-05",
        total_months: 32,
        description: "Холодные звонки, развитие клиентской базы.",
      },
      {
        position: "Стажёр отдела продаж",
        company: "ООО Эпсилон",
        company_industries: [{ name: "Розничная торговля" }],
        start: "2011-01",
        end: "2013-08",
        total_months: 31,
        description: "Первый опыт продаж, работа с возражениями.",
      },
    ],
  },
}

test("extractHhResumeFields: вытаскивает все 5 мест работы из experience[]", () => {
  const fields = extractHhResumeFields(rawResumeWith5Jobs.resume)
  assert.ok(fields.workHistory, "workHistory должен быть заполнен")
  assert.equal(fields.workHistory!.length, 5, "должно быть 5 записей истории занятости")
})

test("formatWorkHistory: в тексте есть все 5 работодателей и должности", () => {
  const fields = extractHhResumeFields(rawResumeWith5Jobs.resume)
  const text = formatWorkHistory(fields.workHistory)

  for (const company of ["ООО Ромашка", "АО Вектор", "ЗАО Гамма", "ИП Дельта", "ООО Эпсилон"]) {
    assert.ok(text.includes(company), `текст должен содержать работодателя "${company}"`)
  }
  for (const position of [
    "Директор по продажам",
    "Руководитель отдела продаж",
    "Ведущий менеджер по продажам",
    "Менеджер по продажам",
    "Стажёр отдела продаж",
  ]) {
    assert.ok(text.includes(position), `текст должен содержать должность "${position}"`)
  }
})

test("formatWorkHistory: в тексте есть даты (периоды) мест работы", () => {
  const fields = extractHhResumeFields(rawResumeWith5Jobs.resume)
  const text = formatWorkHistory(fields.workHistory)

  for (const start of ["2022-01", "2019-03", "2016-06", "2013-09", "2011-01"]) {
    assert.ok(text.includes(start), `текст должен содержать дату начала "${start}"`)
  }
})

test("formatWorkHistory: в тексте есть достижения/цифры результатов", () => {
  const fields = extractHhResumeFields(rawResumeWith5Jobs.resume)
  const text = formatWorkHistory(fields.workHistory)

  assert.ok(text.includes("80%"), "текст должен содержать «80%» (конверсия)")
  assert.ok(text.includes("ROI x3") || text.includes("ROI"), "текст должен содержать ROI")
  assert.ok(text.includes("30+"), "текст должен содержать «30+» клиентов")
  assert.ok(text.includes("10+"), "текст должен содержать «10+» клиентов")
})

test("formatWorkHistory: пустая/отсутствующая история → пустая строка (fallback на legacy experience)", () => {
  assert.equal(formatWorkHistory(null), "")
  assert.equal(formatWorkHistory(undefined), "")
  assert.equal(formatWorkHistory([]), "")
})

test("formatWorkHistory: запись без должности/компании (пустая) отфильтровывается", () => {
  const text = formatWorkHistory([
    { position: null, company: null, industry: null, start: null, end: null, months: null, description: "пустая запись" },
    { position: "Продавец", company: "ООО Тест", industry: null, start: "2020-01", end: null, months: 12, description: null },
  ])
  assert.ok(!text.includes("пустая запись"))
  assert.ok(text.includes("Продавец — ООО Тест"))
})
