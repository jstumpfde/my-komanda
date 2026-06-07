/**
 * Настройки Sales-чатбота — типы, дефолты и хелпер слияния.
 *
 * НЕ импортируй ничего из HR-ядра (chatbot-processor.ts и т.д.).
 * Этот файл — самодостаточный, без внешних импортов.
 */

// ---------------------------------------------------------------------------
// Режим подбора времени (решение 3.2)
// ---------------------------------------------------------------------------

/** hybrid — сначала спросить предпочтение, потом предложить 2-3 конкретных слота.
 *  nearest  — сразу предложить ближайшие доступные слоты.
 *  ask      — уточнить пожелания перед любым предложением.
 */
export type TimePickingMode = "hybrid" | "nearest" | "ask"

// ---------------------------------------------------------------------------
// Настройки реалистичности ответа (аналог ResponseTimingSettings из HR)
// ---------------------------------------------------------------------------

export interface SalesResponseTiming {
  /** Задержка перед основным ответом, секунды (1-300). */
  delaySeconds?: number
  /** Слать ли короткое «минутку...» перед ответом. */
  enableShortMessages?: boolean
  /** Пул коротких фраз-заглушек. */
  shortMessages?: string[]
  /** Максимум коротких сообщений за один диалог (1-10). */
  maxShortMessagesPerDialog?: number
  /** Задержка между коротким и основным сообщением, секунды (3-60). */
  shortToMainDelaySeconds?: number
}

// ---------------------------------------------------------------------------
// Настройки дожима (решение 5.1)
// ---------------------------------------------------------------------------

export interface SalesFollowUpSettings {
  /** Включён ли автоматический дожим. */
  enabled?: boolean
  /** Первое касание — через N минут после отсутствия ответа. */
  firstTouchMinutes?: number
  /** Второе касание — через N часов после первого. */
  secondTouchHours?: number
  /** Максимум касаний, после — остановиться. */
  maxTouches?: number
}

// ---------------------------------------------------------------------------
// Настройки эскалации (решение 6.1)
// ---------------------------------------------------------------------------

export interface SalesEscalationSettings {
  /** Эскалировать при явной просьбе клиента («позовите человека», «хочу с оператором»). */
  onExplicitRequest?: boolean
  /** Список триггеров автоматической эскалации. */
  triggers?: string[]
}

// ---------------------------------------------------------------------------
// Корневой тип настроек Sales-чатбота
// ---------------------------------------------------------------------------

export interface SalesChatbotSettings {
  /** Подбор времени визита (решение 3.2). */
  timePicking?: {
    mode?: TimePickingMode
  }
  /** Бронирование (решение 3.1): autoConfirm=false → финально подтверждает администратор. */
  booking?: {
    autoConfirm?: boolean
  }
  /** Квалификация (решение 2.1): что собирать при записи. */
  qualification?: {
    collect?: string[]
  }
  /** Дожим (решение 5.1). */
  followUp?: SalesFollowUpSettings
  /** Эскалация (решение 6.1). */
  escalation?: SalesEscalationSettings
  /** Настройки реалистичности ответа. */
  responseTiming?: SalesResponseTiming
  /** Лимит сообщений бота в сутки на одного клиента. */
  dailyMessageLimit?: number
  /** Порог уверенности AI — ниже него → эскалация (0-1). */
  confidenceThreshold?: number
}

// ---------------------------------------------------------------------------
// Дефолтные короткие фразы для «минутку» (стиль салона красоты)
// ---------------------------------------------------------------------------

export const DEFAULT_SALES_SHORT_MESSAGES: string[] = [
  "Секунду, уточню расписание…",
  "Минутку, подберу время…",
  "Одну секунду, уточняю у мастера…",
  "Сейчас проверю свободные окошки…",
  "Минуточку, смотрю расписание…",
  "Уточняю, одну секунду…",
  "Подождите немного, подберу удобный вариант…",
]

// ---------------------------------------------------------------------------
// Полные дефолтные настройки (решения Юрия 2.1, 3.1, 3.2, 5.1, 6.1)
// ---------------------------------------------------------------------------

export const DEFAULT_SALES_CHATBOT_SETTINGS = {
  timePicking: {
    /** Гибрид: сначала спросить предпочтение, потом предложить 2-3 конкретных слота. */
    mode: "hybrid" as TimePickingMode,
  },
  booking: {
    /** Слот держим, но финальное подтверждение — за администратором. */
    autoConfirm: false,
  },
  qualification: {
    /** Собираем: услугу, время, мастера (опционально), телефон, новый/повторный, пожелания/повод. */
    collect: [
      "service",
      "time",
      "master_optional",
      "phone",
      "new_or_returning",
      "preferences",
    ],
  },
  followUp: {
    enabled: true,
    /** Первый мягкий дожим через 90 минут. */
    firstTouchMinutes: 90,
    /** Второй — на следующий день (~24 ч). */
    secondTouchHours: 24,
    /** Максимум 3 касания, потом стоп. */
    maxTouches: 3,
  },
  escalation: {
    /** Всегда эскалировать при явной просьбе клиента. */
    onExplicitRequest: true,
    /** Автоматическая эскалация по триггерам. */
    triggers: ["complex_request", "complaint", "cant_handle"],
  },
  responseTiming: {
    /** Задержка 10 сек перед ответом — имитация живого общения. */
    delaySeconds: 10,
    /** Короткие «минутку...» отключены по умолчанию, включаются по желанию. */
    enableShortMessages: false,
    shortMessages: DEFAULT_SALES_SHORT_MESSAGES,
    maxShortMessagesPerDialog: 2,
    shortToMainDelaySeconds: 8,
  },
  /** Лимит сообщений бота клиенту в сутки. */
  dailyMessageLimit: 10,
  /** Ниже 0.7 — AI не уверен, эскалируем. */
  confidenceThreshold: 0.7,
} as const satisfies {
  timePicking: { mode: TimePickingMode }
  booking: { autoConfirm: boolean }
  qualification: { collect: string[] }
  followUp: Required<SalesFollowUpSettings>
  escalation: Required<SalesEscalationSettings>
  responseTiming: Required<SalesResponseTiming>
  dailyMessageLimit: number
  confidenceThreshold: number
}

// ---------------------------------------------------------------------------
// Хелпер глубокого слияния partial-настроек поверх дефолтов
// ---------------------------------------------------------------------------

/**
 * Принимает частичные настройки (или null/undefined) и возвращает
 * полностью заполненный объект настроек — дефолты для всего, чего нет в partial.
 *
 * Вложенные объекты мержатся глубоко: переопределение одного поля не теряет
 * остальные дефолты этого уровня.
 */
export function resolveSalesChatbotSettings(partial?: SalesChatbotSettings | null): {
  timePicking: { mode: TimePickingMode }
  booking: { autoConfirm: boolean }
  qualification: { collect: string[] }
  followUp: Required<SalesFollowUpSettings>
  escalation: Required<SalesEscalationSettings>
  responseTiming: Required<SalesResponseTiming>
  dailyMessageLimit: number
  confidenceThreshold: number
} {
  const d = DEFAULT_SALES_CHATBOT_SETTINGS
  const p = partial ?? {}

  return {
    timePicking: {
      mode: p.timePicking?.mode ?? d.timePicking.mode,
    },
    booking: {
      autoConfirm: p.booking?.autoConfirm ?? d.booking.autoConfirm,
    },
    qualification: {
      collect:
        Array.isArray(p.qualification?.collect) && p.qualification.collect.length > 0
          ? p.qualification.collect
          : [...d.qualification.collect],
    },
    followUp: {
      enabled: p.followUp?.enabled ?? d.followUp.enabled,
      firstTouchMinutes: p.followUp?.firstTouchMinutes ?? d.followUp.firstTouchMinutes,
      secondTouchHours: p.followUp?.secondTouchHours ?? d.followUp.secondTouchHours,
      maxTouches: p.followUp?.maxTouches ?? d.followUp.maxTouches,
    },
    escalation: {
      onExplicitRequest: p.escalation?.onExplicitRequest ?? d.escalation.onExplicitRequest,
      triggers:
        Array.isArray(p.escalation?.triggers) && p.escalation.triggers.length > 0
          ? p.escalation.triggers
          : [...d.escalation.triggers],
    },
    responseTiming: {
      delaySeconds: p.responseTiming?.delaySeconds ?? d.responseTiming.delaySeconds,
      enableShortMessages:
        p.responseTiming?.enableShortMessages ?? d.responseTiming.enableShortMessages,
      shortMessages:
        Array.isArray(p.responseTiming?.shortMessages) &&
        p.responseTiming.shortMessages.length > 0
          ? p.responseTiming.shortMessages
          : [...d.responseTiming.shortMessages],
      maxShortMessagesPerDialog:
        p.responseTiming?.maxShortMessagesPerDialog ??
        d.responseTiming.maxShortMessagesPerDialog,
      shortToMainDelaySeconds:
        p.responseTiming?.shortToMainDelaySeconds ?? d.responseTiming.shortToMainDelaySeconds,
    },
    dailyMessageLimit: p.dailyMessageLimit ?? d.dailyMessageLimit,
    confidenceThreshold: p.confidenceThreshold ?? d.confidenceThreshold,
  }
}
