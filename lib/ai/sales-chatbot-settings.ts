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

  // ---------------------------------------------------------------------------
  // Новые поля (группа расширения)
  // ---------------------------------------------------------------------------

  /**
   * Ночной режим: диапазон часов, в который бот переключается в особый режим.
   * instant_ack — мгновенно шлёт ackMessage и не ждёт AI-ответа.
   * full_reply  — AI отвечает как обычно, но без задержки (бот «дежурит»).
   */
  nightMode?: {
    enabled?: boolean
    /** Час начала ночи (0-23). */
    startHour?: number
    /** Час конца ночи (0-23). */
    endHour?: number
    mode?: "instant_ack" | "full_reply"
    /** Текст авто-ответа при instant_ack. */
    ackMessage?: string
  }

  /**
   * Человечная задержка ответа: бот выбирает случайное значение из диапазона.
   * Отдельно от responseTiming.delaySeconds (который фиксированный).
   */
  responseDelay?: {
    minSeconds?: number
    maxSeconds?: number
  }

  /** Индикатор «печатает…» перед отправкой ответа. */
  typing?: {
    enabled?: boolean
    /** Сколько секунд показывать индикатор (имитация). */
    durationSeconds?: number
  }

  /** Что видит клиент, если выбранный слот успели занять до подтверждения. */
  slotTaken?: {
    message?: string
  }

  /** Настройки уведомлений администратора/владельца о событиях бота. */
  notifications?: {
    /** Каналы уведомлений. */
    channels?: Array<"telegram" | "email">
    /** Кому слать (роли). */
    recipients?: Array<"master" | "owner" | "admin">
    telegramChatId?: string | null
    email?: string | null
  }

  /**
   * Целевая метрика успеха диалога.
   * booked — клиент записан.
   * showed  — клиент пришёл на визит.
   * paid    — клиент оплатил услугу.
   */
  successMetric?: "booked" | "showed" | "paid"
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

  // ---------------------------------------------------------------------------
  // Дефолты новых полей (группа расширения)
  // ---------------------------------------------------------------------------

  nightMode: {
    /** Ночной режим включён по умолчанию. */
    enabled: true,
    /** Начало ночи — 22:00. */
    startHour: 22,
    /** Конец ночи — 09:00. */
    endHour: 9,
    /** Мгновенный авто-ответ без AI. */
    mode: "instant_ack" as "instant_ack" | "full_reply",
    ackMessage:
      "Здравствуйте! Сейчас нерабочее время, но я уже могу записать вас — подскажите услугу и удобное время.",
  },
  responseDelay: {
    /** Минимальная задержка ответа — 2 сек. */
    minSeconds: 2,
    /** Максимальная задержка ответа — 8 сек. */
    maxSeconds: 8,
  },
  typing: {
    /** Показывать индикатор «печатает…» перед ответом. */
    enabled: true,
    /** Имитируем 3 секунды набора. */
    durationSeconds: 3,
  },
  slotTaken: {
    message:
      "К сожалению, это время только что заняли. Давайте подберём другое — какое вам удобно?",
  },
  notifications: {
    /** По умолчанию — только Telegram. */
    channels: ["telegram"] as Array<"telegram" | "email">,
    /** Уведомляем владельца. */
    recipients: ["owner"] as Array<"master" | "owner" | "admin">,
    telegramChatId: null,
    email: null,
  },
  /** Целевая метрика: считаем успехом запись. */
  successMetric: "booked" as "booked" | "showed" | "paid",
} as const satisfies {
  timePicking: { mode: TimePickingMode }
  booking: { autoConfirm: boolean }
  qualification: { collect: string[] }
  followUp: Required<SalesFollowUpSettings>
  escalation: Required<SalesEscalationSettings>
  responseTiming: Required<SalesResponseTiming>
  dailyMessageLimit: number
  confidenceThreshold: number
  nightMode: {
    enabled: boolean
    startHour: number
    endHour: number
    mode: "instant_ack" | "full_reply"
    ackMessage: string
  }
  responseDelay: { minSeconds: number; maxSeconds: number }
  typing: { enabled: boolean; durationSeconds: number }
  slotTaken: { message: string }
  notifications: {
    channels: Array<"telegram" | "email">
    recipients: Array<"master" | "owner" | "admin">
    telegramChatId: null
    email: null
  }
  successMetric: "booked" | "showed" | "paid"
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
  nightMode: {
    enabled: boolean
    startHour: number
    endHour: number
    mode: "instant_ack" | "full_reply"
    ackMessage: string
  }
  responseDelay: { minSeconds: number; maxSeconds: number }
  typing: { enabled: boolean; durationSeconds: number }
  slotTaken: { message: string }
  notifications: {
    channels: Array<"telegram" | "email">
    recipients: Array<"master" | "owner" | "admin">
    telegramChatId: string | null
    email: string | null
  }
  successMetric: "booked" | "showed" | "paid"
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

    // -------------------------------------------------------------------------
    // Новые секции (группа расширения)
    // -------------------------------------------------------------------------

    nightMode: {
      enabled: p.nightMode?.enabled ?? d.nightMode.enabled,
      startHour: p.nightMode?.startHour ?? d.nightMode.startHour,
      endHour: p.nightMode?.endHour ?? d.nightMode.endHour,
      mode: p.nightMode?.mode ?? d.nightMode.mode,
      ackMessage: p.nightMode?.ackMessage ?? d.nightMode.ackMessage,
    },
    responseDelay: {
      minSeconds: p.responseDelay?.minSeconds ?? d.responseDelay.minSeconds,
      maxSeconds: p.responseDelay?.maxSeconds ?? d.responseDelay.maxSeconds,
    },
    typing: {
      enabled: p.typing?.enabled ?? d.typing.enabled,
      durationSeconds: p.typing?.durationSeconds ?? d.typing.durationSeconds,
    },
    slotTaken: {
      message: p.slotTaken?.message ?? d.slotTaken.message,
    },
    notifications: {
      // Массивы: заменяем целиком если переданы непустые, иначе дефолт
      channels:
        Array.isArray(p.notifications?.channels) && p.notifications.channels.length > 0
          ? p.notifications.channels
          : [...d.notifications.channels],
      recipients:
        Array.isArray(p.notifications?.recipients) && p.notifications.recipients.length > 0
          ? p.notifications.recipients
          : [...d.notifications.recipients],
      // null — допустимое значение (не настроено), поэтому проверяем через hasOwnProperty
      telegramChatId:
        p.notifications !== undefined && "telegramChatId" in p.notifications
          ? (p.notifications.telegramChatId ?? null)
          : d.notifications.telegramChatId,
      email:
        p.notifications !== undefined && "email" in p.notifications
          ? (p.notifications.email ?? null)
          : d.notifications.email,
    },
    successMetric: p.successMetric ?? d.successMetric,
  }
}
