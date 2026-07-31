// Юнит-тесты lib/hr/interview-reminder-texts.ts (задача
// editable-interview-reminder-texts, 14.07). Главное доказательство —
// «дефолт (компания ничего не настраивала) рендерит БАЙТ-В-БАЙТ то же самое,
// что и старый хардкод app/api/cron/interview-reminders/route.ts» — legacy*
// функции ниже дословно повторяют формулы ДО рефакторинга, замороженные как
// золотой эталон. Если DEFAULT_REMINDER_TEXTS разойдётся со старым
// поведением — тест упадёт.
//
// Запуск: pnpm test (см. package.json — tsx --test <список файлов>).

import { test } from "node:test"
import assert from "node:assert/strict"
import { renderReminderText, REMINDER_KINDS, type ReminderKind } from "./interview-reminder-texts"

// ─── Золотой эталон — старые формулы (route.ts до рефакторинга) ───────────

function legacyCandidateText(kind: ReminderKind, when: string, location: string, rescheduleLine: string): string {
  const candidateLead =
    kind === "24h"     ? "завтра"
    : kind === "morning" ? "сегодня"
    : kind === "15m"   ? "через 15 минут"
    : "через час"
  return `Здравствуйте! Напоминаем, что ${candidateLead} в ${when} запланировано собеседование.${location}${rescheduleLine}`
}

function legacyHrBody(title: string, when: string, location: string): string {
  return `«${title}» — ${when}${location}`
}

function legacyManagerText(kind: ReminderKind, title: string, when: string, location: string): string {
  const managerLead =
    kind === "24h"     ? "через 24 часа"
    : kind === "morning" ? "сегодня"
    : kind === "1h"    ? "через час"
    : "через 15 минут"
  return `⏰ <b>Интервью ${managerLead}</b>\n«${title}» — ${when}${location}`
}

// Разные комбинации данных события: офис/онлайн/без формата, с/без токена
// перезаписи — чтобы покрыть все ветки locationLine/rescheduleLine.
const CASES: Array<{ label: string; title: string; when: string; location: string; reschedule: string }> = [
  {
    label:      "офис + токен перезаписи",
    title:      "Интервью — Иван Петров",
    when:       "14 июля, 18:00 (МСК)",
    location:   "\n📍 ул. Ленина, 1, оф. 305",
    reschedule: "\n\nНе получается в это время? Выберите другое: https://company24.pro/schedule/abc123",
  },
  {
    label:      "онлайн, без токена",
    title:      "Интервью — Мария Сидорова",
    when:       "15 июля, 10:30 (МСК)",
    location:   "\n🔗 https://meet.google.com/xyz-vwjk",
    reschedule: "",
  },
  {
    label:      "формат не задан",
    title:      "Собеседование",
    when:       "16 июля, 09:00 (МСК)",
    location:   "",
    reschedule: "",
  },
]

for (const kind of REMINDER_KINDS) {
  for (const c of CASES) {
    const vars = { event_title: c.title, interview_at: c.when, location: c.location, reschedule_link: c.reschedule }

    test(`дефолт candidate[${kind}] байт-в-байт как старый хардкод (${c.label})`, () => {
      const out = renderReminderText("candidate", kind, undefined, vars)
      assert.equal(out, legacyCandidateText(kind, c.when, c.location, c.reschedule))
    })

    test(`дефолт hr[${kind}] байт-в-байт как старый хардкод (${c.label})`, () => {
      const out = renderReminderText("hr", kind, undefined, vars)
      assert.equal(out, legacyHrBody(c.title, c.when, c.location))
    })

    test(`дефолт manager[${kind}] байт-в-байт как старый хардкод (${c.label})`, () => {
      const out = renderReminderText("manager", kind, undefined, vars)
      assert.equal(out, legacyManagerText(kind, c.title, c.when, c.location))
    })
  }
}

// Пустой объект reminderTexts (компания открыла настройки, но ничего не
// поменяла) — тоже наследует дефолт, не только undefined.
test("пустой объект reminderTexts → наследует дефолт (не только undefined)", () => {
  const vars = { event_title: "X", interview_at: "18:00", location: "", reschedule_link: "" }
  const out = renderReminderText("candidate", "1h", {}, vars)
  assert.equal(out, legacyCandidateText("1h", "18:00", "", ""))
})

// Пробелы-только строка в overrides — тоже трактуются как «не задано».
test("строка из пробелов в override → наследует дефолт", () => {
  const vars = { event_title: "Y", interview_at: "10:00", location: "", reschedule_link: "" }
  const out = renderReminderText("hr", "morning", { hr: { morning: "   " } }, vars)
  assert.equal(out, legacyHrBody("Y", "10:00", ""))
})

// ─── Override компании реально побеждает и рендерит плейсхолдеры ──────────

test("непустой override компании перебивает дефолт и подставляет {{when}}", () => {
  const out = renderReminderText(
    "candidate",
    "1h",
    { candidate: { "1h": "Скоро встреча: {{when}}!" } },
    { event_title: "X", interview_at: "18:00", location: "", reschedule_link: "" },
  )
  assert.equal(out, "Скоро встреча: 18:00!")
})

test("override одного канала/порога не задевает остальные (дефолт для них сохраняется)", () => {
  const overrides = { candidate: { "1h": "Кастом за час" } }
  const vars = { event_title: "X", interview_at: "18:00", location: "", reschedule_link: "" }
  assert.equal(renderReminderText("candidate", "1h", overrides, vars), "Кастом за час")
  assert.equal(renderReminderText("candidate", "24h", overrides, vars), legacyCandidateText("24h", "18:00", "", ""))
  assert.equal(renderReminderText("hr", "1h", overrides, vars), legacyHrBody("X", "18:00", ""))
})

test("плейсхолдеры {{title}}/{{location}} тоже подставляются в кастомном тексте", () => {
  const out = renderReminderText(
    "manager",
    "morning",
    { manager: { morning: "«{{title}}» сегодня, локация:{{location}}" } },
    { event_title: "Собес — Пётр", interview_at: "10:00", location: "\n📍 Офис", reschedule_link: "" },
  )
  assert.equal(out, "«Собес — Пётр» сегодня, локация:\n📍 Офис")
})
