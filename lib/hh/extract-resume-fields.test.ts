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
import { extractHhResumeFields, formatWorkHistory, extractAllContacts } from "./extract-resume-fields"

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

// ─── extractAllContacts — задача Юрия 05.07: показать ВСЕ способы связи + предпочтительный ──
//
// Симптом: секция «КОНТАКТЫ» показывала только phone/email/Telegram/WhatsApp
// без preferred/comment/verified — кандидат мог написать «звоните только в
// Telegram, не дозвонитесь по телефону» в comment, а HR его не видел.

test("extractAllContacts: предпочтительный контакт с комментарием кандидата — preferred=true, comment сохранён", () => {
  const raw = {
    contact: [
      {
        kind: "phone",
        type: { id: "cell", name: "Мобильный телефон" },
        preferred: false,
        verified: false,
        value: { formatted: "+7 (999) 123-45-67" },
      },
      {
        kind: "telegram",
        type: { id: "telegram", name: "Telegram" },
        preferred: true,
        verified: false,
        comment: "Пишите, пожалуйста, в Telegram, если не дозвонитесь — @nick",
        value: "@nick",
        links: { web: "https://t.me/nick" },
      },
    ],
  }
  const contacts = extractAllContacts(raw)
  assert.equal(contacts.length, 2)
  // preferred — первым
  assert.equal(contacts[0].typeId, "telegram")
  assert.equal(contacts[0].preferred, true)
  assert.equal(contacts[0].comment, "Пишите, пожалуйста, в Telegram, если не дозвонитесь — @nick")
  assert.equal(contacts[0].href, "https://t.me/nick")
  assert.equal(contacts[0].verified, false)
})

test("extractAllContacts: несколько телефонов (cell/home/work) — все попадают в список, каждый со своей ссылкой tel:", () => {
  const raw = {
    contact: [
      { type: { id: "cell", name: "Мобильный телефон" }, preferred: false, value: { formatted: "+7 999 111-22-33" } },
      { type: { id: "home", name: "Домашний телефон" }, preferred: false, value: { formatted: "+7 495 222-33-44" } },
      { type: { id: "work", name: "Рабочий телефон" }, preferred: false, value: { formatted: "+7 495 333-44-55" } },
    ],
  }
  const contacts = extractAllContacts(raw)
  assert.equal(contacts.length, 3, "должны быть все 3 телефона, не только первый")
  const ids = contacts.map((c) => c.typeId).sort()
  assert.deepEqual(ids, ["cell", "home", "work"])
  for (const c of contacts) {
    assert.ok(c.href?.startsWith("tel:"), `href контакта ${c.typeId} должен начинаться с tel:`)
  }
})

test("extractAllContacts: telegram с links.web — href берётся из ссылки мессенджера, а не mailto/tel", () => {
  const raw = {
    contact: [
      {
        type: { id: "telegram", name: "Telegram" },
        preferred: false,
        verified: true,
        value: "@candidate_nick",
        links: { web: "https://t.me/candidate_nick", ios: "tg://resolve?domain=candidate_nick" },
      },
    ],
  }
  const contacts = extractAllContacts(raw)
  assert.equal(contacts.length, 1)
  assert.equal(contacts[0].href, "https://t.me/candidate_nick")
  assert.equal(contacts[0].display, "@candidate_nick")
  assert.equal(contacts[0].verified, true)
  assert.equal(contacts[0].typeLabel, "Telegram")
})

test("extractAllContacts: email — href строится как mailto:", () => {
  const raw = {
    contact: [
      { type: { id: "email" }, preferred: false, value: { email: "test@example.com" } },
    ],
  }
  const contacts = extractAllContacts(raw)
  assert.equal(contacts.length, 1)
  assert.equal(contacts[0].href, "mailto:test@example.com")
  assert.equal(contacts[0].typeLabel, "Email")
})

test("extractAllContacts: неизвестный тип контакта — generic-фолбэк по type.name, href=null без links", () => {
  const raw = {
    contact: [
      { type: { id: "some_new_messenger_2027", name: "НовыйМессенджер" }, preferred: false, value: "user123" },
    ],
  }
  const contacts = extractAllContacts(raw)
  assert.equal(contacts.length, 1)
  assert.equal(contacts[0].typeLabel, "НовыйМессенджер")
  assert.equal(contacts[0].href, null)
})

test("extractAllContacts: нет contact[] или не hh-данные — пустой массив (fallback-режим)", () => {
  assert.deepEqual(extractAllContacts(null), [])
  assert.deepEqual(extractAllContacts(undefined), [])
  assert.deepEqual(extractAllContacts({}), [])
  assert.deepEqual(extractAllContacts({ contact: "not-an-array" }), [])
})
