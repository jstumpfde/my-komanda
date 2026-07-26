// Запуск: npx tsx --env-file=.env.local --test lib/telegram/tiket-bot.test.ts
// (нужен --env-file — модуль импортирует lib/db, которому нужен DATABASE_URL;
// гейт непривязанных чатов и анти-спам используют реальное локальное соединение).
import { test, after } from "node:test"
import assert from "node:assert/strict"
import { eq } from "drizzle-orm"
import { db, pgClient } from "@/lib/db"
import { users, userTelegramLinks } from "@/lib/db/schema"
import {
  parseSearchCommand,
  parseWatchCommand,
  parseDateArg,
  resolveCityToIata,
  checkRateLimit,
  resetRateLimitForTests,
  handleTiketBotUpdate,
  hasDirectOffer,
  isValidFutureDate,
  mergePendingQuery,
  missingFieldsPrompt,
  resetPendingForTests,
  NOT_LINKED_TEXT,
  HELP_TEXT,
} from "./tiket-bot"
import type { FlightOffer } from "@/lib/business-assistant/flights/types"

// ─── resolveCityToIata ──────────────────────────────────────────────────────

test("resolveCityToIata: IATA-код в любом регистре", () => {
  assert.equal(resolveCityToIata("MOW"), "MOW")
  assert.equal(resolveCityToIata("mow"), "MOW")
})

test("resolveCityToIata: русские названия городов из словаря", () => {
  assert.equal(resolveCityToIata("Москва"), "MOW")
  assert.equal(resolveCityToIata("питер"), "LED")
  assert.equal(resolveCityToIata("мск"), "MOW")
  assert.equal(resolveCityToIata("Сочи"), "AER")
})

test("resolveCityToIata: неизвестный город — null", () => {
  assert.equal(resolveCityToIata("Урюпинск"), null)
  assert.equal(resolveCityToIata(""), null)
})

// ─── parseDateArg ───────────────────────────────────────────────────────────

test("parseDateArg: точная дата ДД.ММ (год достраивается)", () => {
  const r = parseDateArg("30.08")
  assert.ok(r)
  assert.match(r!.from, /^\d{4}-08-30$/)
  assert.equal(r!.to, undefined)
})

test("parseDateArg: точная дата с годом", () => {
  assert.deepEqual(parseDateArg("30.08.2026"), { from: "2026-08-30" })
})

test("parseDateArg: диапазон ДД.ММ-ДД.ММ", () => {
  const r = parseDateArg("10.08-20.08")
  assert.ok(r)
  assert.match(r!.from, /-08-10$/)
  assert.match(r!.to!, /-08-20$/)
})

test("parseDateArg: мусор — null", () => {
  assert.equal(parseDateArg("не дата"), null)
  assert.equal(parseDateArg("32.13"), null)
})

// ─── parseSearchCommand ─────────────────────────────────────────────────────

test("parseSearchCommand: /поиск MOW LED 30.08", () => {
  const r = parseSearchCommand("/поиск MOW LED 30.08")
  assert.ok(!("error" in r))
  assert.equal((r as { originIata: string }).originIata, "MOW")
  assert.equal((r as { destinationIata: string }).destinationIata, "LED")
})

test("parseSearchCommand: города по-русски и диапазон", () => {
  const r = parseSearchCommand("/поиск Москва Питер 10.08-20.08")
  assert.ok(!("error" in r))
  const ok = r as { originIata: string; destinationIata: string; dateTo?: string }
  assert.equal(ok.originIata, "MOW")
  assert.equal(ok.destinationIata, "LED")
  assert.ok(ok.dateTo)
})

test("parseSearchCommand: недостаточно аргументов — ошибка", () => {
  const r = parseSearchCommand("/поиск MOW")
  assert.ok("error" in r)
})

test("parseSearchCommand: нераспознанный город — ошибка", () => {
  const r = parseSearchCommand("/поиск Урюпинск LED 30.08")
  assert.ok("error" in r)
})

// ─── parseWatchCommand ──────────────────────────────────────────────────────

test("parseWatchCommand: /следить MOW LED 30.08 до 5000", () => {
  const r = parseWatchCommand("/следить MOW LED 30.08 до 5000")
  assert.ok(!("error" in r))
  const ok = r as { originIata: string; maxPriceRub?: number }
  assert.equal(ok.originIata, "MOW")
  assert.equal(ok.maxPriceRub, 5000)
})

test("parseWatchCommand: без целевой цены", () => {
  const r = parseWatchCommand("/следить MOW LED 30.08")
  assert.ok(!("error" in r))
  assert.equal((r as { maxPriceRub?: number }).maxPriceRub, undefined)
})

// ─── Анти-спам: 10/мин на chatId ────────────────────────────────────────────

test("checkRateLimit: пропускает первые 10 в минуту, дальше блокирует", () => {
  resetRateLimitForTests()
  const chatId = "999111"
  const now = Date.now()
  for (let i = 0; i < 10; i++) {
    assert.equal(checkRateLimit(chatId, now), true, `запрос ${i + 1} должен пройти`)
  }
  assert.equal(checkRateLimit(chatId, now), false, "11-й запрос должен быть заблокирован")
})

test("checkRateLimit: окно очищается через 60с", () => {
  resetRateLimitForTests()
  const chatId = "999222"
  const t0 = Date.now()
  for (let i = 0; i < 10; i++) checkRateLimit(chatId, t0)
  assert.equal(checkRateLimit(chatId, t0), false)
  assert.equal(checkRateLimit(chatId, t0 + 61_000), true, "после окна должно снова пропускать")
})

test("checkRateLimit: разные chatId не мешают друг другу", () => {
  resetRateLimitForTests()
  const now = Date.now()
  for (let i = 0; i < 10; i++) checkRateLimit("A", now)
  assert.equal(checkRateLimit("A", now), false)
  assert.equal(checkRateLimit("B", now), true, "другой chatId должен иметь свой лимит")
})

// ─── Гейт непривязанных чатов (реальная локальная БД, без TG-сети) ─────────

test("handleTiketBotUpdate: непривязанный chatId получает NOT_LINKED_TEXT, не выполняет команду", async () => {
  resetRateLimitForTests()
  const originalFetch = global.fetch
  const calls: { url: string; body: unknown }[] = []
  global.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null })
    return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 })
  }) as typeof fetch

  try {
    const chatId = -777_888_999 // заведомо не привязанный тестовый chat_id
    await handleTiketBotUpdate({
      update_id: 1,
      message: { message_id: 1, chat: { id: chatId, type: "private" }, text: "/мои" },
    })
  } finally {
    global.fetch = originalFetch
  }

  const sendCalls = calls.filter((c) => c.url.includes("/sendMessage"))
  assert.equal(sendCalls.length, 1)
  assert.equal((sendCalls[0].body as { text: string }).text, NOT_LINKED_TEXT)
})

test("handleTiketBotUpdate: /start без токена присылает приветствие (не гейтится)", async () => {
  resetRateLimitForTests()
  const originalFetch = global.fetch
  const calls: { url: string; body: unknown }[] = []
  global.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null })
    return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 })
  }) as typeof fetch

  try {
    const chatId = -777_888_998
    await handleTiketBotUpdate({
      update_id: 2,
      message: { message_id: 2, chat: { id: chatId, type: "private" }, text: "/start" },
    })
  } finally {
    global.fetch = originalFetch
  }

  const sendCalls = calls.filter((c) => c.url.includes("/sendMessage"))
  assert.equal(sendCalls.length, 1)
  assert.ok((sendCalls[0].body as { text: string }).text.includes("Привет"))
})

test("HELP_TEXT содержит все команды", () => {
  for (const cmd of ["/поиск", "/следить", "/мои", "/стоп", "/help"]) {
    assert.ok(HELP_TEXT.includes(cmd), `HELP_TEXT должен упоминать ${cmd}`)
  }
})

// ─── isValidFutureDate ──────────────────────────────────────────────────────

test("isValidFutureDate: сегодня и в пределах года — валидны", () => {
  const today = new Date().toISOString().slice(0, 10)
  assert.equal(isValidFutureDate(today), true)
  const inSixMonths = new Date()
  inSixMonths.setUTCMonth(inSixMonths.getUTCMonth() + 6)
  assert.equal(isValidFutureDate(inSixMonths.toISOString().slice(0, 10)), true)
})

test("isValidFutureDate: прошлое, мусор, дальше года — невалидны", () => {
  assert.equal(isValidFutureDate("2020-01-01"), false)
  assert.equal(isValidFutureDate("не дата"), false)
  assert.equal(isValidFutureDate(null), false)
  assert.equal(isValidFutureDate(undefined), false)
  const farFuture = new Date()
  farFuture.setUTCFullYear(farFuture.getUTCFullYear() + 3)
  assert.equal(isValidFutureDate(farFuture.toISOString().slice(0, 10)), false)
})

// ─── mergePendingQuery / missingFieldsPrompt (многошаговый диалог) ────────

test("mergePendingQuery: новые поля перекрывают старые, недостающие берутся из pending", () => {
  const pending = { originIata: "MUC", destinationIata: null, dateFrom: null, dateTo: null, maxPriceRub: null }
  const incoming = { originIata: null, destinationIata: "MOW", dateFrom: "2026-08-02", dateTo: null, maxPriceRub: null }
  const merged = mergePendingQuery(pending, incoming)
  assert.deepEqual(merged, { originIata: "MUC", destinationIata: "MOW", dateFrom: "2026-08-02", dateTo: null, maxPriceRub: null })
})

test("mergePendingQuery: без pending — просто данные AI", () => {
  const incoming = { originIata: "MUC", destinationIata: "MOW", dateFrom: "2026-08-02", dateTo: null, maxPriceRub: null }
  assert.deepEqual(mergePendingQuery(null, incoming), incoming)
})

test("missingFieldsPrompt: не хватает только даты — переспрашивает дату, помня маршрут", () => {
  const msg = missingFieldsPrompt({ originIata: "MUC", destinationIata: "MOW", dateFrom: null, dateTo: null, maxPriceRub: null })
  assert.ok(msg.includes("MUC"))
  assert.ok(msg.includes("MOW"))
  assert.ok(msg.includes("дат"))
})

test("missingFieldsPrompt: не хватает всего — просит маршрут", () => {
  const msg = missingFieldsPrompt({ originIata: null, destinationIata: null, dateFrom: null, dateTo: null, maxPriceRub: null })
  assert.ok(msg.toLowerCase().includes("маршрут"))
})

// ─── hasDirectOffer (для "Прямых рейсов нет, показываю с пересадками") ────

function offer(transfers: number): FlightOffer {
  return {
    id: `t-${transfers}`, kind: transfers === 0 ? "direct" : "combo", priceRub: 10000,
    airlineLabel: "Test", transfers, durationMinutes: 300, deepLink: "",
    departDate: "2026-08-02", departHour: 10, cabinClass: "economy",
    baggage: { handLuggage: null, checkedBaggage: null, unknown: true },
  }
}

test("hasDirectOffer: true, если есть предложение с 0 пересадками", () => {
  assert.equal(hasDirectOffer([offer(2), offer(0), offer(1)]), true)
})

test("hasDirectOffer: false, если у всех есть пересадки (напр. MUC→MOW)", () => {
  assert.equal(hasDirectOffer([offer(1), offer(2)]), false)
})

test("hasDirectOffer: false для пустого списка", () => {
  assert.equal(hasDirectOffer([]), false)
})

// ─── Повторный /start уже привязанного чата (реальная БД) ─────────────────

test("handleTiketBotUpdate: повторный /start привязанного чата — 'уже привязан', не 'привяжите'", async () => {
  resetRateLimitForTests()
  resetPendingForTests()

  const [anyUser] = await db.select({ id: users.id, companyId: users.companyId }).from(users).limit(1)
  assert.ok(anyUser?.companyId, "в локальной БД должен быть хотя бы один пользователь с companyId для теста")

  const testChatId = "7770001"
  // Подчистим возможный хвост от прошлого прогона теста и создадим привязанный link.
  await db.delete(userTelegramLinks).where(eq(userTelegramLinks.chatId, testChatId))
  await db.insert(userTelegramLinks).values({
    userId: anyUser.id,
    companyId: anyUser.companyId!,
    chatId: testChatId,
    linkToken: `test-token-${testChatId}`,
    linkedAt: new Date(),
  })

  const originalFetch = global.fetch
  const calls: { url: string; body: unknown }[] = []
  global.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null })
    return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 })
  }) as typeof fetch

  try {
    await handleTiketBotUpdate({
      update_id: 3,
      message: { message_id: 3, chat: { id: Number(testChatId), type: "private" }, text: "/start" },
    })
  } finally {
    global.fetch = originalFetch
    await db.delete(userTelegramLinks).where(eq(userTelegramLinks.chatId, testChatId))
  }

  const sendCalls = calls.filter((c) => c.url.includes("/sendMessage"))
  assert.equal(sendCalls.length, 1)
  const replyText = (sendCalls[0].body as { text: string }).text
  assert.ok(replyText.includes("уже привязан"), `ожидали "уже привязан", получили: ${replyText}`)
  assert.ok(!replyText.includes("привяжите"), `не должно просить привязать заново: ${replyText}`)
})

// Закрываем пул соединений — иначе node:test не завершает процесс сам.
after(async () => {
  await pgClient.end({ timeout: 1 })
})
