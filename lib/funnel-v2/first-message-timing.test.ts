// Юнит-тесты тайминга ПЕРВОГО сообщения воронки v2 (паритет со стадией 1 «Портрет»).
// Инвариант: рабочее время → без доп. паузы (inviteDelaySeconds уже выдержана
// deferral'ом до входа в стадию); нерабочее время + offHoursEnabled → пауза
// offHoursDelaySeconds, ровно как legacy-ветка offHoursSoftMode.
// Запуск: pnpm exec tsx --test lib/funnel-v2/first-message-timing.test.ts

import { test } from "node:test"
import assert from "node:assert/strict"
import {
  resolveV2FirstMessageDelayMs,
  DEFAULT_OFF_HOURS_DELAY_SECONDS,
} from "./first-message-timing"
import type { VacancySchedule } from "@/lib/schedule/can-send-now"

// Расписание: Пн–Пт 09:00–18:30, Europe/Moscow.
const SCHED: VacancySchedule = {
  scheduleEnabled:     true,
  scheduleStart:       "09:00",
  scheduleEnd:         "18:30",
  scheduleTimezone:    "Europe/Moscow",
  scheduleWorkingDays: [1, 2, 3, 4, 5],
}

// Пятница 2026-07-17 12:00 МСК (09:00 UTC) — РАБОЧЕЕ время.
const WORKING_NOW = new Date("2026-07-17T09:00:00Z")
// Пятница 2026-07-17 23:00 МСК (20:00 UTC) — НЕрабочее (после 18:30).
const OFF_HOURS_NOW = new Date("2026-07-17T20:00:00Z")

test("рабочее время → 0 (рабочая задержка inviteDelaySeconds уже выдержана до входа)", () => {
  const ms = resolveV2FirstMessageDelayMs(SCHED, { enabled: true, delaySeconds: 15 }, WORKING_NOW)
  assert.equal(ms, 0)
})

test("нерабочее время + offHoursEnabled → offHoursDelaySeconds * 1000", () => {
  const ms = resolveV2FirstMessageDelayMs(SCHED, { enabled: true, delaySeconds: 15 }, OFF_HOURS_NOW)
  assert.equal(ms, 15_000)
})

test("нерабочее время + другая offHoursDelaySeconds (30) → 30_000", () => {
  const ms = resolveV2FirstMessageDelayMs(SCHED, { enabled: true, delaySeconds: 30 }, OFF_HOURS_NOW)
  assert.equal(ms, 30_000)
})

test("нерабочее время + offHoursEnabled=false → 0 (кандидат отложен до утра)", () => {
  const ms = resolveV2FirstMessageDelayMs(SCHED, { enabled: false, delaySeconds: 15 }, OFF_HOURS_NOW)
  assert.equal(ms, 0)
})

test("нерабочее время + offHoursDelaySeconds=0 → 0 (пауза выключена)", () => {
  const ms = resolveV2FirstMessageDelayMs(SCHED, { enabled: true, delaySeconds: 0 }, OFF_HOURS_NOW)
  assert.equal(ms, 0)
})

test("нерабочее время + невалидная delaySeconds → дефолт 15 сек", () => {
  const ms = resolveV2FirstMessageDelayMs(
    SCHED,
    { enabled: true, delaySeconds: Number.NaN },
    OFF_HOURS_NOW,
  )
  assert.equal(ms, DEFAULT_OFF_HOURS_DELAY_SECONDS * 1000)
})

test("расписание выключено → всегда рабочее время → 0", () => {
  const ms = resolveV2FirstMessageDelayMs(
    { scheduleEnabled: false },
    { enabled: true, delaySeconds: 15 },
    OFF_HOURS_NOW,
  )
  assert.equal(ms, 0)
})
