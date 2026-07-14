// Юнит-тесты живого запроса hh-стадии negotiation (#23, fix 13.07).
// Запуск: pnpm exec tsx --test lib/hh/sync-inbound-stages.test.ts
//
// Ключевая проверка: fetchNegotiationState должна читать РЕАЛЬНУЮ папку
// работодателя (employer_state.id), а НЕ грубый lifecycle-статус (state.id).
// До фикса функция читала state.id → грубый статус («interview»/«response»)
// не совпадал с папкой HR («phone_interview» и т.п.), из-за чего входящий
// синк двигал стадию мимо реальности, а watchdog-сверка генерила ложные
// critical-алерты (Дубаневич Денис, Пеструхина Светлана, вакансия Revoluterra).

import { test, afterEach } from "node:test"
import assert from "node:assert/strict"

// db-модуль ленивый (postgres-js не коннектится до первого запроса), но
// process.env.DATABASE_URL нужен для конструктора — ставим заглушку.
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test"

import { fetchNegotiationState, shouldMoveForward } from "./sync-inbound-stages"

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
})

function mockFetch(body: unknown, ok = true, status = 200) {
  globalThis.fetch = (async () =>
    ({
      ok,
      status,
      json: async () => body,
    }) as unknown as Response) as typeof fetch
}

test("возвращает employer_state.id (реальную папку работодателя), а НЕ state.id", async () => {
  // Именно этот расклад ловил баг: грубый state.id='interview', но кандидат
  // реально в папке 'phone_interview' («Первичный контакт»).
  mockFetch({
    state: { id: "interview" },
    employer_state: { id: "phone_interview" },
  })
  const got = await fetchNegotiationState("token", "5428018805")
  assert.equal(got, "phone_interview")
  assert.notEqual(got, "interview")
})

test("грубый state.id='response' не подменяет папку employer_state='consider'", async () => {
  mockFetch({
    state: { id: "response" },
    employer_state: { id: "consider" },
  })
  assert.equal(await fetchNegotiationState("token", "n1"), "consider")
})

test("отказ работодателя: employer_state.id='discard_by_employer'", async () => {
  mockFetch({
    state: { id: "discard" },
    employer_state: { id: "discard_by_employer" },
  })
  assert.equal(await fetchNegotiationState("token", "n2"), "discard_by_employer")
})

test("нет employer_state в ответе → null (безопасный fallback, не трогаем стадию)", async () => {
  // Осознанно НЕ откатываемся на state.id: грубый статус не авторитетен для
  // папки. null = «оставить нашу стадию как есть» / сверка не алертит.
  mockFetch({ state: { id: "interview" } })
  assert.equal(await fetchNegotiationState("token", "n3"), null)
})

test("не-200 ответ → null (403/404/сеть — штатное «не получилось»)", async () => {
  mockFetch({ employer_state: { id: "phone_interview" } }, false, 403)
  assert.equal(await fetchNegotiationState("token", "n4"), null)
})

test("исключение fetch (таймаут/сеть) → null, не бросает", async () => {
  globalThis.fetch = (async () => {
    throw new Error("network")
  }) as typeof fetch
  assert.equal(await fetchNegotiationState("token", "n5"), null)
})

// ─── shouldMoveForward: защита от отката прогресса (инцидент 14.07) ──────────
//
// hh-папка consider/phone_interview маппится в раннюю primary_contact; если
// наш внутренний прогресс уже дальше — входящий синк НЕ должен тянуть назад.

test("НЕ откатывает: demo_opened + hh=consider(→primary_contact) → остаёмся", () => {
  // Именно этот кейс сбросил 500 кандидатов Revoluterra demo_opened→primary_contact.
  assert.equal(shouldMoveForward("demo_opened", "primary_contact"), false)
})

test("НЕ откатывает: decision(«Демо пройдено»)/anketa_filled + hh=consider → остаёмся", () => {
  assert.equal(shouldMoveForward("decision", "primary_contact"), false)
  assert.equal(shouldMoveForward("anketa_filled", "primary_contact"), false)
})

test("НЕ откатывает: interview/offer_sent + hh=assessment(→test_task_sent) → остаёмся", () => {
  assert.equal(shouldMoveForward("interview", "test_task_sent"), false)
  assert.equal(shouldMoveForward("offer_sent", "test_task_sent"), false)
})

test("НЕ откатывает терминальные: hired/started_work + hh=interview → остаёмся", () => {
  assert.equal(shouldMoveForward("hired", "interview"), false)
  assert.equal(shouldMoveForward("started_work", "interview"), false)
})

test("НЕ воскрешает: rejected + не-отказный сигнал(→interview) → остаёмся", () => {
  assert.equal(shouldMoveForward("rejected", "interview"), false)
})

test("ДВИГАЕТ вперёд: new + hh=phone_interview(→primary_contact) → двигаем", () => {
  assert.equal(shouldMoveForward("new", "primary_contact"), true)
})

test("ДВИГАЕТ вперёд: primary_contact→test_task_sent, demo_opened→interview", () => {
  assert.equal(shouldMoveForward("primary_contact", "test_task_sent"), true)
  assert.equal(shouldMoveForward("demo_opened", "interview"), true)
})

test("ДВИГАЕТ вперёд к найму: offer_sent + hh=hired → двигаем", () => {
  assert.equal(shouldMoveForward("offer_sent", "hired"), true)
})

test("идемпотентность: current === target → не двигаем", () => {
  assert.equal(shouldMoveForward("primary_contact", "primary_contact"), false)
  assert.equal(shouldMoveForward("interview", "interview"), false)
})

test("legacy-slug resolved: final_decision + hh=consider → НЕ откатываем", () => {
  // final_decision → канонический decision; interviewed → interview.
  assert.equal(shouldMoveForward("final_decision", "primary_contact"), false)
  assert.equal(shouldMoveForward("interviewed", "test_task_sent"), false)
})
