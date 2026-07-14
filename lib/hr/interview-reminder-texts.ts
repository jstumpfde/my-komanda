// Тексты напоминаний об интервью — 4 порога (24ч/утро/1ч/15мин) × 3 канала
// (кандидат/HR-канал/менеджер). Задача editable-interview-reminder-texts
// (14.07): раньше были захардкожены прямо в app/api/cron/interview-reminders
// (нарушение правила «никаких вшитых фраз» — never-hardcode-configurable-content).
//
// Хранение: companies.hiring_defaults_json.schedule.reminderTexts (см.
// CompanyHiringDefaults в lib/db/schema.ts). Наследование: пустая/отсутствующая
// строка на любом уровне → DEFAULT_REMINDER_TEXTS ниже (байт-в-байт совпадает
// со старым хардкодом — см. lib/hr/interview-reminder-texts.test.ts).
//
// Рендер — общий renderTemplate() (lib/template-renderer.ts), тот же движок,
// что используют все остальные точки отправки кандидатам. Доступные
// плейсхолдеры — REMINDER_TEXT_VARS ниже.
//
// СОЗНАТЕЛЬНО ОСТАВЛЕНО хардкодом (малая структурная метка, не «сообщение»):
// короткая фраза-заголовок «через 24 часа»/«сегодня»/«через час»/«через 15
// минут» — используется ТОЛЬКО как (а) title in-app уведомления
// (notifications.title) и (б) первая строка Telegram-сообщения менеджеру/
// HR-каналу для восприятия «когда» с одного взгляда. Сам текст сообщения
// (то, что видит кандидат/HR/менеджер как содержание) — полностью редактируем
// через reminderTexts. См. lib/settings/registry.ts →
// schedule.interviewReminderLeadLabel (задокументировано как остаточный debt).

import { renderTemplate } from "@/lib/template-renderer"

export type ReminderKind = "24h" | "morning" | "1h" | "15m"
export type ReminderChannel = "candidate" | "hr" | "manager"

export const REMINDER_KINDS: ReminderKind[] = ["24h", "morning", "1h", "15m"]
export const REMINDER_CHANNELS: ReminderChannel[] = ["candidate", "hr", "manager"]

export const REMINDER_KIND_LABELS: Record<ReminderKind, string> = {
  "24h":     "За 24 часа",
  morning:   "Утром в день интервью",
  "1h":      "За 1 час",
  "15m":     "За 15 минут",
}

export const REMINDER_CHANNEL_LABELS: Record<ReminderChannel, string> = {
  candidate: "Кандидату",
  hr:        "HR-каналу",
  manager:   "Менеджеру",
}

// Короткая метка-заголовок по порогу — НЕ редактируется через reminderTexts
// (см. комментарий вверху файла). Совпадает с historical managerLead/lead
// в app/api/cron/interview-reminders/route.ts.
export const REMINDER_LEAD_PHRASES: Record<ReminderKind, string> = {
  "24h":    "через 24 часа",
  morning:  "сегодня",
  "1h":     "через час",
  "15m":    "через 15 минут",
}

/** Оверрайды компании — форма companies.hiring_defaults_json.schedule.reminderTexts. */
export type ReminderTextsOverrides = Partial<Record<ReminderChannel, Partial<Record<ReminderKind, string>>>>

// Плейсхолдеры, доступные в текстах напоминаний (рендерятся renderTemplate).
// available — для каких каналов плейсхолдер реально что-то подставит (для
// остальных каналов будет литералом "{{...}}" + warn в консоль, т.к. значение
// не передаётся — избегаем показывать бессмысленные подсказки).
export const REMINDER_TEXT_VARS: Array<{ token: string; description: string; channels: ReminderChannel[] }> = [
  { token: "{{when}}",            description: "Дата и время интервью с часовым поясом (напр. «14 июля, 18:00 (МСК)»)", channels: ["candidate", "hr", "manager"] },
  { token: "{{title}}",           description: "Название события в календаре (обычно «Интервью — Имя кандидата»)",     channels: ["candidate", "hr", "manager"] },
  { token: "{{location}}",        description: "Адрес офиса или ссылка на видеозвонок (с иконкой, отдельной строкой) — пусто, если не задано", channels: ["candidate", "hr", "manager"] },
  { token: "{{reschedule_link}}", description: "Блок «Не получается в это время? Выберите другое: <ссылка>» — пусто, если у кандидата нет токена записи", channels: ["candidate"] },
]

// ─── Дефолты — байт-в-байт копия старого хардкода (см. тест) ──────────────

export const DEFAULT_REMINDER_TEXTS: Record<ReminderChannel, Record<ReminderKind, string>> = {
  candidate: {
    "24h":   "Здравствуйте! Напоминаем, что завтра в {{when}} запланировано собеседование.{{location}}{{reschedule_link}}",
    morning: "Здравствуйте! Напоминаем, что сегодня в {{when}} запланировано собеседование.{{location}}{{reschedule_link}}",
    "1h":    "Здравствуйте! Напоминаем, что через час в {{when}} запланировано собеседование.{{location}}{{reschedule_link}}",
    "15m":   "Здравствуйте! Напоминаем, что через 15 минут в {{when}} запланировано собеседование.{{location}}{{reschedule_link}}",
  },
  // HR-канал (in-app notifications.body + Telegram-канал компании — та же
  // строка обеих поверхностей, как и в исходном коде). Текст не зависел от
  // kind в хардкоде — 4 дефолта одинаковы, но компания может развести их
  // по-разному под каждый порог.
  hr: {
    "24h":   "«{{title}}» — {{when}}{{location}}",
    morning: "«{{title}}» — {{when}}{{location}}",
    "1h":    "«{{title}}» — {{when}}{{location}}",
    "15m":   "«{{title}}» — {{when}}{{location}}",
  },
  // Менеджер (Telegram DM) — одно сообщение целиком, лид-фраза вшита в дефолт
  // (как и в исходном коде — там это тоже была одна строка, не title+body).
  manager: {
    "24h":   "⏰ <b>Интервью через 24 часа</b>\n«{{title}}» — {{when}}{{location}}",
    morning: "⏰ <b>Интервью сегодня</b>\n«{{title}}» — {{when}}{{location}}",
    "1h":    "⏰ <b>Интервью через час</b>\n«{{title}}» — {{when}}{{location}}",
    "15m":   "⏰ <b>Интервью через 15 минут</b>\n«{{title}}» — {{when}}{{location}}",
  },
}

/**
 * Резолвит и рендерит текст напоминания для канала+порога.
 * overrides?.[channel]?.[kind] — если непустая строка (после trim), побеждает
 * дефолт; иначе (undefined/пусто/пробелы) — используется DEFAULT_REMINDER_TEXTS
 * (наследование "компания не настраивала → дефолт-код").
 */
export function renderReminderText(
  channel: ReminderChannel,
  kind: ReminderKind,
  overrides: ReminderTextsOverrides | undefined,
  vars: Record<string, string>,
): string {
  const raw = overrides?.[channel]?.[kind]
  const text = (typeof raw === "string" && raw.trim()) ? raw : DEFAULT_REMINDER_TEXTS[channel][kind]
  return renderTemplate(text, vars)
}
