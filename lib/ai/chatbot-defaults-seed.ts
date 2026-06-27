// Лёгкий модуль СИД-констант дефолтных текстов AI чат-бота (без БД/AI-клиента),
// чтобы их могли импортировать и settings.ts (платформенный слой), и
// chatbot-processor.ts, и prequalification — без тяжёлых зависимостей.
//
// Это ПОСЛЕДНИЙ фолбэк (сид). Источник правды — редактируемый платформенный
// эталон platform_settings['chatbot_defaults'] (+ override компании).
// SAFETY_RULES (security-гардрейлы) сюда НЕ входят — намеренно неизменны.

import type { ChatbotDefaults } from "@/lib/db/schema"

// Шаблоны автоматических отказов бота.
export const DEFAULT_REJECTION_MESSAGES = {
  injection:     "В связи с нарушением правил общения мы вынуждены прекратить рассмотрение вашей кандидатуры.",
  severeAbuse:   "Мы вынуждены прекратить общение в связи с нарушением норм общения.",
  repeatedAbuse: "К сожалению, мы решили прекратить общение.",
  unstable:      "По итогам нашего общения мы решили пока не двигаться дальше. Спасибо за интерес к нашей компании.",
}

// Первое предупреждение за неуважительный тон.
export const FIRST_WARNING_MESSAGE =
  "Прошу общаться корректно. Готов продолжить обсуждение вакансии."

// «Короткие» сообщения (имитация печати «пишет…»).
export const DEFAULT_SHORT_MESSAGES: string[] = [
  "Минутку, сейчас посмотрю...",
  "Секунду, проверю информацию",
  "Сейчас уточню, минутку...",
  "Один момент...",
  "Подождите немного, отвечу подробно",
  "Сейчас отвечу",
  "Минутку",
]

// Напоминания предквалификации (если кандидат не ответил на вопросы).
export const DEFAULT_PREQUAL_REMINDER_D1 =
  "{{name}}, напомню — вы откликнулись на «{{vacancy}}». Ответьте, пожалуйста, на пару коротких вопросов, чтобы я мог двигаться дальше с вашей кандидатурой."
export const DEFAULT_PREQUAL_REMINDER_D3 =
  "{{name}}, ещё раз напоминаю про вопросы по «{{vacancy}}». Если не получу ответ — отправлю вам общую демонстрацию должности без уточнений."

// Собранный сид для платформенного слоя.
export const CHATBOT_DEFAULTS_SEED: ChatbotDefaults = {
  rejectionInjection:     DEFAULT_REJECTION_MESSAGES.injection,
  rejectionSevereAbuse:   DEFAULT_REJECTION_MESSAGES.severeAbuse,
  rejectionRepeatedAbuse: DEFAULT_REJECTION_MESSAGES.repeatedAbuse,
  rejectionUnstable:      DEFAULT_REJECTION_MESSAGES.unstable,
  firstWarning:           FIRST_WARNING_MESSAGE,
  shortMessages:          DEFAULT_SHORT_MESSAGES,
  prequalReminderD1:      DEFAULT_PREQUAL_REMINDER_D1,
  prequalReminderD3:      DEFAULT_PREQUAL_REMINDER_D3,
}
