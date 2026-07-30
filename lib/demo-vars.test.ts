// Юнит-тесты общего рендера {{переменных}} демо-контента (lib/demo-vars.ts).
// node:test, как и остальные тесты в pnpm test.
//
// Ключевая регрессия, ради которой существует модуль: старые локальные
// реализации в demo-client.tsx / course-types.ts использовали /\{\{(\w+)\}\}/g,
// а `\w` в JS не матчит кириллицу — «{{город}}», «{{имя}}» не подставлялись
// вообще (кандидат видел сырые скобки).

import { test } from "node:test"
import assert from "node:assert/strict"
import {
  renderDemoVars,
  withCityVars,
  salaryRangeRu,
  workFormatRu,
  scheduleRu,
  yearsOnMarketRu,
  buildDemoVarsMap,
} from "./demo-vars"

// toLocaleString("ru-RU") разделяет тысячи неразрывным пробелом.
const NBSP = "\u00A0"
// Фиксированное «сейчас» для детерминизма «лет_на_рынке».
const NOW_2026 = new Date("2026-07-11T12:00:00Z")

// ─── renderDemoVars: сама подстановка ────────────────────────────────────────

test("кириллический плейсхолдер {{город}} подставляется", () => {
  const out = renderDemoVars("Город: {{город}}", { "город": "Казань" })
  assert.equal(out, "Город: Казань")
})

test("кириллица с подчёркиванием {{имя_кандидата}} подставляется", () => {
  const out = renderDemoVars("Здравствуйте, {{имя_кандидата}}!", { "имя_кандидата": "Иван" })
  assert.equal(out, "Здравствуйте, Иван!")
})

test("несколько переменных в одном тексте", () => {
  const out = renderDemoVars("{{компания}} ждёт вас: {{город}}", {
    "компания": "ТехноГрупп",
    "город": "Уфа",
  })
  assert.equal(out, "ТехноГрупп ждёт вас: Уфа")
})

test("неизвестный ключ остаётся литералом {{офис}}", () => {
  const out = renderDemoVars("Адрес: {{офис}}", { "город": "Казань" })
  assert.equal(out, "Адрес: {{офис}}")
})

test("пустое значение → пустая строка (?? , не ||)", () => {
  const out = renderDemoVars("Город: {{город}}!", { "город": "" })
  assert.equal(out, "Город: !")
})

test("обычный текст в фигурных скобках не трогаем", () => {
  const out = renderDemoVars("set {x: 1} и {{про-дефис}}", { "город": "Казань" })
  assert.equal(out, "set {x: 1} и {{про-дефис}}")
})

test("пустой text → пустая строка", () => {
  assert.equal(renderDemoVars("", { "город": "Казань" }), "")
})

// ─── withCityVars: производная «в_городе» ────────────────────────────────────

test("withCityVars добавляет «в_городе» в предложном падеже", () => {
  const map = withCityVars({ "город": "Казань" })
  assert.equal(map["в_городе"], "в Казани")
  assert.equal(map["город"], "Казань") // именительный не тронут
})

test("withCityVars: нераспознанный город → безопасный fallback", () => {
  const map = withCityVars({ "город": "Верхние Мандрики" })
  assert.equal(map["в_городе"], "в городе Верхние Мандрики")
})

test("withCityVars: пустой город → пустая «в_городе»", () => {
  const map = withCityVars({ "город": "" })
  assert.equal(map["в_городе"], "")
})

test("withCityVars: города нет в map → «в_городе» пустая", () => {
  const map = withCityVars({ "компания": "ТехноГрупп" })
  assert.equal(map["в_городе"], "")
})

test("withCityVars не перезаписывает явно заданную «в_городе»", () => {
  const map = withCityVars({ "город": "Казань", "в_городе": "в столице Татарстана" })
  assert.equal(map["в_городе"], "в столице Татарстана")
})

// ─── Интеграция: фраза с предлогом ───────────────────────────────────────────

test("«Работа {{в_городе}}» → «Работа в Казани»", () => {
  const out = renderDemoVars("Работа {{в_городе}}", withCityVars({ "город": "Казань" }))
  assert.equal(out, "Работа в Казани")
})

test("«на склад {{в_городе}}» → «на склад в Москве»", () => {
  const out = renderDemoVars(
    "Компания ищет кладовщика на склад {{в_городе}}.",
    withCityVars({ "город": "Москва" }),
  )
  assert.equal(out, "Компания ищет кладовщика на склад в Москве.")
})

// ─── salaryRangeRu: {{зарплата}} — диапазон одной строкой ────────────────────
// AI-промпты (demo-ai.ts, library/create) велят использовать {{зарплата}},
// seed-шаблоны пишут «Оклад: {{зарплата}}» — рендер обязан её знать.

test("salaryRangeRu: обе границы → «80 000 – 150 000 ₽»", () => {
  assert.equal(salaryRangeRu(80000, 150000), `80${NBSP}000 – 150${NBSP}000 ₽`)
})

test("salaryRangeRu: только нижняя → «от 80 000 ₽»", () => {
  assert.equal(salaryRangeRu(80000, null), `от 80${NBSP}000 ₽`)
})

test("salaryRangeRu: только верхняя → «до 150 000 ₽»", () => {
  assert.equal(salaryRangeRu(null, 150000), `до 150${NBSP}000 ₽`)
})

test("salaryRangeRu: границы равны → одно число", () => {
  assert.equal(salaryRangeRu(100000, 100000), `100${NBSP}000 ₽`)
})

test("salaryRangeRu: нет данных (null/0) → пустая строка", () => {
  assert.equal(salaryRangeRu(null, null), "")
  assert.equal(salaryRangeRu(0, 0), "") // 0 = «не указано», как зарплата_от в demo-client
})

// ─── workFormatRu: {{формат_работы}} из vacancies.format ────────────────────

test("workFormatRu: кодовые значения → русские ярлыки", () => {
  assert.equal(workFormatRu("office"), "офис")
  assert.equal(workFormatRu("hybrid"), "гибрид")
  assert.equal(workFormatRu("remote"), "удалёнка")
})

test("workFormatRu: пусто → пустая строка", () => {
  assert.equal(workFormatRu(null), "")
  assert.equal(workFormatRu(""), "")
})

test("workFormatRu: свободный текст проходит как есть", () => {
  assert.equal(workFormatRu("офис/удалёнка"), "офис/удалёнка")
})

// ─── scheduleRu: {{график}} из vacancies.schedule ────────────────────────────

test("scheduleRu: кодовые значения → русские ярлыки", () => {
  assert.equal(scheduleRu("5/2"), "5/2")
  assert.equal(scheduleRu("2/2"), "2/2")
  assert.equal(scheduleRu("free"), "свободный")
  assert.equal(scheduleRu("shift"), "сменный")
  assert.equal(scheduleRu("rotation"), "вахта")
})

test("scheduleRu: other/пусто → пустая строка", () => {
  assert.equal(scheduleRu("other"), "") // «other» без расшифровки кандидату не показываем
  assert.equal(scheduleRu(null), "")
})

test("scheduleRu: нестандартный текст проходит как есть", () => {
  assert.equal(scheduleRu("6/1"), "6/1")
})

// ─── yearsOnMarketRu: {{лет_на_рынке}} из companies.foundedYear ──────────────

test("yearsOnMarketRu: 2014 → «12» (в 2026)", () => {
  assert.equal(yearsOnMarketRu(2014, NOW_2026), "12")
})

test("yearsOnMarketRu: свежая компания / будущее / мусор / пусто → пустая строка", () => {
  assert.equal(yearsOnMarketRu(2026, NOW_2026), "") // «на рынке 0 лет» не пишем
  assert.equal(yearsOnMarketRu(2030, NOW_2026), "")
  assert.equal(yearsOnMarketRu(1899, NOW_2026), "")
  assert.equal(yearsOnMarketRu(null, NOW_2026), "")
})

// ─── buildDemoVarsMap: единая карта переменных демо-страницы ─────────────────

test("buildDemoVarsMap: полный источник — все переменные демо", () => {
  const map = buildDemoVarsMap({
    candidateName: "Иван Петров",
    companyName: "ТехноГрупп",
    vacancyTitle: "Менеджер по продажам",
    salaryMin: 80000,
    salaryMax: 150000,
    city: "Казань",
    format: "office",
    schedule: "5/2",
    officeAddress: "ул. Пушкина, 1",
    industry: "IT",
    employeeCount: 150,
    foundedYear: 2014,
    director: "Анна Петрова",
  }, NOW_2026)
  assert.equal(map["имя"], "Иван")
  assert.equal(map["имя_кандидата"], "Иван")
  assert.equal(map["компания"], "ТехноГрупп")
  assert.equal(map["должность"], "Менеджер по продажам")
  assert.equal(map["зарплата_от"], `80${NBSP}000`)
  assert.equal(map["зарплата_до"], `150${NBSP}000`)
  assert.equal(map["зарплата"], `80${NBSP}000 – 150${NBSP}000 ₽`)
  assert.equal(map["город"], "Казань")
  assert.equal(map["в_городе"], "в Казани")
  assert.equal(map["формат_работы"], "офис")
  assert.equal(map["график"], "5/2")
  assert.equal(map["офис"], "ул. Пушкина, 1")
  assert.equal(map["отрасль"], "IT")
  assert.equal(map["сотрудников"], "150")
  assert.equal(map["лет_на_рынке"], "12")
  assert.equal(map["руководитель"], "Анна Петрова")
})

test("buildDemoVarsMap: «Мария Ивановна Сидорова» → имя «Мария» (первое слово)", () => {
  const map = buildDemoVarsMap({ candidateName: "Мария Ивановна Сидорова" }, NOW_2026)
  assert.equal(map["имя"], "Мария")
})

test("buildDemoVarsMap: пустой источник → известные ключи пустые, не литералы", () => {
  const map = buildDemoVarsMap({}, NOW_2026)
  assert.equal(renderDemoVars("Оклад: {{зарплата}}.", map), "Оклад: .")
  assert.equal(renderDemoVars("Формат: {{формат_работы}}", map), "Формат: ")
  assert.equal(map["в_городе"], "")
})

test("buildDemoVarsMap: неизвестный ключ остаётся литералом", () => {
  const map = buildDemoVarsMap({ companyName: "ТехноГрупп" }, NOW_2026)
  assert.equal(
    renderDemoVars("{{средний_чек}} у {{компания}}", map),
    "{{средний_чек}} у ТехноГрупп",
  )
})

test("интеграция: «Оклад: {{зарплата}}» из seed-шаблона", () => {
  const out = renderDemoVars(
    "Оклад: {{зарплата}}",
    buildDemoVarsMap({ salaryMin: 80000, salaryMax: 150000 }, NOW_2026),
  )
  assert.equal(out, `Оклад: 80${NBSP}000 – 150${NBSP}000 ₽`)
})
