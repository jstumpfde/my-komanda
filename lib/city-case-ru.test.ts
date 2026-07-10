// lib/city-case-ru.test.ts
// Юнит-тесты склонения города в предложный падеж (lib/city-case-ru.ts).
// Запуск: pnpm exec tsx --test lib/city-case-ru.test.ts

import { test } from "node:test"
import assert from "node:assert/strict"
import { cityPrepositionalRu, inCityRu } from "./city-case-ru"

test("словарь: города из примера задачи", () => {
  assert.equal(cityPrepositionalRu("Москва"), "Москве")
  assert.equal(cityPrepositionalRu("Санкт-Петербург"), "Санкт-Петербурге")
  assert.equal(cityPrepositionalRu("Казань"), "Казани")
  assert.equal(cityPrepositionalRu("Нижний Новгород"), "Нижнем Новгороде")
})

test("баг из бэклога: «Современный офис в Москва» → «в Москве»", () => {
  const city = "Москва"
  const bullet = `Современный офис в ${cityPrepositionalRu(city)}`
  assert.equal(bullet, "Современный офис в Москве")
})

test("словарь: составные названия (два слова, оба меняются)", () => {
  assert.equal(cityPrepositionalRu("Ростов-на-Дону"), "Ростове-на-Дону")
  assert.equal(cityPrepositionalRu("Набережные Челны"), "Набережных Челнах")
  assert.equal(cityPrepositionalRu("Великий Новгород"), "Великом Новгороде")
  assert.equal(cityPrepositionalRu("Старый Оскол"), "Старом Осколе")
})

test("словарь: города-спутники Москвы (плюрале tantum город/деревни-«-ы/-и»)", () => {
  assert.equal(cityPrepositionalRu("Химки"), "Химках")
  assert.equal(cityPrepositionalRu("Мытищи"), "Мытищах")
  assert.equal(cityPrepositionalRu("Люберцы"), "Люберцах")
})

test("словарь: переопределение мужского рода на «-ь»/«-поль» (общее правило дало бы женский род)", () => {
  assert.equal(cityPrepositionalRu("Ярославль"), "Ярославле")
  assert.equal(cityPrepositionalRu("Ставрополь"), "Ставрополе")
  assert.equal(cityPrepositionalRu("Севастополь"), "Севастополе")
  assert.equal(cityPrepositionalRu("Симферополь"), "Симферополе")
})

test("словарь: беглая гласная и отымённые прилагательные", () => {
  assert.equal(cityPrepositionalRu("Череповец"), "Череповце")
  assert.equal(cityPrepositionalRu("Грозный"), "Грозном")
  assert.equal(cityPrepositionalRu("Мирный"), "Мирном")
})

test("несклоняемые (пример из задачи: Сочи/Гродно) — как есть", () => {
  assert.equal(cityPrepositionalRu("Сочи"), "Сочи")
  assert.equal(cityPrepositionalRu("Гродно"), "Гродно")
  assert.equal(cityPrepositionalRu("Тольятти"), "Тольятти")
  assert.equal(cityPrepositionalRu("Баку"), "Баку")
})

test("общее правило: ...а/...я → ...е (город не в словаре)", () => {
  assert.equal(cityPrepositionalRu("Анапа"), "Анапе")
  assert.equal(cityPrepositionalRu("Тотьма"), "Тотьме")
})

test("общее правило: ...ь → ...и — эвристика по умолчанию (город не в словаре)", () => {
  assert.equal(cityPrepositionalRu("Гжель"), "Гжели")
})

test("общее правило: ...й → ...е (город не в словаре)", () => {
  assert.equal(cityPrepositionalRu("Валдай"), "Валдае")
})

test("общее правило: ...ия → ...ии (город не в словаре)", () => {
  assert.equal(cityPrepositionalRu("Мордовия"), "Мордовии")
})

test("общее правило: согласная на конце → +е — самый частый случай (город не в словаре)", () => {
  assert.equal(cityPrepositionalRu("Брянск"), "Брянске")
  assert.equal(cityPrepositionalRu("Новороссийск"), "Новороссийске")
})

test("безопасный fallback: город не распознан правилами → «городе {Имя}»", () => {
  assert.equal(cityPrepositionalRu("Иваново"), "городе Иваново")
  assert.equal(cityPrepositionalRu("Верхние Мандрики"), "городе Верхние Мандрики")
  assert.equal(cityPrepositionalRu("Кукуево"), "городе Кукуево")
})

test("регистронезависимый поиск по словарю, регистр вывода — из словаря", () => {
  assert.equal(cityPrepositionalRu("москва"), "Москве")
  assert.equal(cityPrepositionalRu("МОСКВА"), "Москве")
  assert.equal(cityPrepositionalRu("сОчИ"), "Сочи")
})

test("обрезает пробелы по краям", () => {
  assert.equal(cityPrepositionalRu("  Москва  "), "Москве")
})

test("пустая строка / null / undefined → \"\"", () => {
  assert.equal(cityPrepositionalRu(""), "")
  assert.equal(cityPrepositionalRu("   "), "")
  assert.equal(cityPrepositionalRu(null), "")
  assert.equal(cityPrepositionalRu(undefined), "")
})

test("inCityRu: готовая фраза с предлогом", () => {
  assert.equal(inCityRu("Москва"), "в Москве")
  assert.equal(inCityRu("Сочи"), "в Сочи")
  assert.equal(inCityRu("Кукуево"), "в городе Кукуево")
})

test("inCityRu: пустой город → пустая строка (не «в »)", () => {
  assert.equal(inCityRu(""), "")
  assert.equal(inCityRu(null), "")
  assert.equal(inCityRu(undefined), "")
})
