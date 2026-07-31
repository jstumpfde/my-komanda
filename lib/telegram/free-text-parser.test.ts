import { test } from "node:test"
import assert from "node:assert/strict"
import {
  parseFreeTextRuleBased,
  extractDate,
  extractBudget,
  matchCityPhrase,
  resolveCityExact,
  nextWeekend,
} from "./free-text-parser"

// ─── Обязательные тест-кейсы (фразы Юрия) ──────────────────────────────────

test('"Из Мюнхен в Москву 2.08.2026" → MUC/MOW/2026-08-02, уверенный матч', () => {
  const r = parseFreeTextRuleBased("Из Мюнхен в Москву 2.08.2026")
  assert.equal(r.status, "ok")
  if (r.status !== "ok") return
  assert.equal(r.data.originIata, "MUC")
  assert.equal(r.data.destinationIata, "MOW")
  assert.equal(r.data.dateFrom, "2026-08-02")
  assert.equal(r.confident, true)
})

test('"Mun - Mos 02.08.26" → MUC/MOW/2026-08-02', () => {
  const r = parseFreeTextRuleBased("Mun - Mos 02.08.26")
  assert.equal(r.status, "ok")
  if (r.status !== "ok") return
  assert.equal(r.data.originIata, "MUC")
  assert.equal(r.data.destinationIata, "MOW")
  assert.equal(r.data.dateFrom, "2026-08-02")
  assert.equal(r.confident, true)
})

test('"Откуда Mun - куда Mos 02.08.26" → MUC/MOW/2026-08-02', () => {
  const r = parseFreeTextRuleBased("Откуда Mun - куда Mos 02.08.26")
  assert.equal(r.status, "ok")
  if (r.status !== "ok") return
  assert.equal(r.data.originIata, "MUC")
  assert.equal(r.data.destinationIata, "MOW")
  assert.equal(r.data.dateFrom, "2026-08-02")
  assert.equal(r.confident, true)
})

test('"найди билеты в питер на выходные до 6 тысяч" → LED + ближайшие сб-вс + 6000, origin не задан', () => {
  const today = new Date()
  const r = parseFreeTextRuleBased("найди билеты в питер на выходные до 6 тысяч", today)
  assert.equal(r.status, "ok")
  if (r.status !== "ok") return
  assert.equal(r.data.destinationIata, "LED")
  assert.equal(r.data.originIata, null)
  assert.equal(r.data.maxPriceRub, 6000)
  assert.ok(r.data.dateFrom)
  assert.ok(r.data.dateTo)
  const expectedWeekend = nextWeekend(today)
  assert.equal(r.data.dateFrom, expectedWeekend.from)
  assert.equal(r.data.dateTo, expectedWeekend.to)
  // не уверенный матч — origin не назван, бот должен переспросить
  assert.equal(r.confident, false)
})

test('"в стамбул 10-20.08" → IST + диапазон 10-20 августа', () => {
  const today = new Date()
  const r = parseFreeTextRuleBased("в стамбул 10-20.08", today)
  assert.equal(r.status, "ok")
  if (r.status !== "ok") return
  assert.equal(r.data.destinationIata, "IST")
  assert.ok(r.data.dateFrom?.endsWith("-08-10"))
  assert.ok(r.data.dateTo?.endsWith("-08-20"))
})

// ─── extractDate ────────────────────────────────────────────────────────────

test("extractDate: относительные даты вычисляются от today, не хардкодятся", () => {
  const today = new Date("2026-07-20T00:00:00Z")
  const tomorrow = extractDate("завтра слетать", today)
  assert.equal(tomorrow?.from, "2026-07-21")

  const dayAfter = extractDate("послезавтра", today)
  assert.equal(dayAfter?.from, "2026-07-22")
})

test("extractDate: 'на выходные' — ближайшая суббота-воскресенье от today", () => {
  const monday = new Date("2026-07-20T00:00:00Z") // понедельник
  const r = extractDate("на выходные", monday)
  assert.ok(r)
  assert.equal(new Date(`${r!.from}T00:00:00Z`).getUTCDay(), 6) // суббота
  assert.equal(new Date(`${r!.to}T00:00:00Z`).getUTCDay(), 0) // воскресенье
})

test("extractDate: 'с 10 по 20 августа' — диапазон с месяцем", () => {
  const r = extractDate("слетать с 10 по 20 августа, пожалуйста")
  assert.ok(r)
  assert.ok(r!.from.endsWith("-08-10"))
  assert.ok(r!.to!.endsWith("-08-20"))
})

test("extractDate: '2 августа' — день+месяц без года", () => {
  const r = extractDate("хочу лететь 2 августа")
  assert.ok(r)
  assert.ok(r!.from.endsWith("-08-02"))
})

test("extractDate: '2/8' слэш-формат", () => {
  const r = extractDate("билет на 2/8")
  assert.ok(r)
  assert.ok(r!.from.endsWith("-08-02"))
})

// ─── extractBudget ──────────────────────────────────────────────────────────

test("extractBudget: 'до 6 тысяч' → 6000", () => {
  assert.equal(extractBudget("билеты до 6 тысяч")?.amount, 6000)
})

test("extractBudget: 'до 6к' → 6000", () => {
  assert.equal(extractBudget("до 6к")?.amount, 6000)
})

test("extractBudget: 'до 6000' → 6000", () => {
  assert.equal(extractBudget("до 6000 руб")?.amount, 6000)
})

test("extractBudget: без бюджета — null", () => {
  assert.equal(extractBudget("билеты в москву 2.08"), null)
})

// ─── Города: точный/нечёткий матчинг ────────────────────────────────────────

test("resolveCityExact: строгий матчинг (для команд) без угадывания по префиксу", () => {
  assert.equal(resolveCityExact("Москва"), "MOW")
  assert.equal(resolveCityExact("MOW"), "MOW")
  assert.equal(resolveCityExact("Мюнх"), null) // усечённое — не резолвится строго
})

test("matchCityPhrase: падежные окончания ('Москву' → MOW)", () => {
  const r = matchCityPhrase("Москву")
  assert.ok(r && "iata" in r)
  assert.equal((r as { iata: string }).iata, "MOW")
})

test("matchCityPhrase: короткие разговорные сокращения ('Mun'→MUC, 'Mos'→MOW)", () => {
  assert.equal((matchCityPhrase("Mun") as { iata: string })?.iata, "MUC")
  assert.equal((matchCityPhrase("Mos") as { iata: string })?.iata, "MOW")
})

test("matchCityPhrase: неизвестный город — null", () => {
  assert.equal(matchCityPhrase("Урюпинск"), null)
})

test("parseFreeTextRuleBased: не про билеты вообще — no_match", () => {
  const r = parseFreeTextRuleBased("привет, как дела?")
  assert.equal(r.status, "no_match")
})
