// Политики каналов (Channel Compliance Policy).
//
// CHANNEL_POLICY — единственный источник правды о том, что разрешено/запрещено
// для каждого канала. Работает в двух местах:
//   1. UI воронки: поля, нарушающие политику активного канала, дизейблятся/валидируются
//      (фаза 2 — пока не реализовано, см. docs/AVITO-INTEGRATION-PLAN.md).
//   2. Рантайм-адаптер: каждое исходящее сообщение прогоняется через sanitizeOutbound
//      ДО отправки (defense-in-depth).
//
// ⚠️ ЧЕРНОВИК. Точные ban-правила Авито необходимо ВЕРИФИЦИРОВАТЬ по официальной
// документации developers.avito.ru перед боевым включением. Текущие значения —
// разумные дефолты на основе публичной политики площадки.

export type ChannelPolicyChannel = "hh" | "avito"

// Действия над кандидатом, допустимые в данном канале.
export type AllowedAction = "invitation" | "discard" | "assessment"

export interface ChannelPolicy {
  // ─── Запреты на контент ──────────────────────────────────────────────────
  // Запрещать внешние ссылки (http/https, t.me, vk.com и т.п.) в исходящих.
  // Авито запрещает уводить соискателей с площадки через ссылки.
  forbidExternalLinks: boolean

  // Запрещать телефонные номера в тексте чата.
  // Авито запрещает делиться контактами для общения вне площадки.
  forbidPhoneInChat: boolean

  // ─── Ограничения автоматизации ──────────────────────────────────────────
  // Запрещать массовый авто-первый-контакт (broadcast-рассылку 1-го сообщения).
  // Авито расценивает это как спам.
  forbidAutoFirstContactBroadcast: boolean

  // Лимит автоматических исходящих сообщений в сутки (null = без ограничений).
  // TODO: уточнить реальный лимит Авито Messenger API по документации.
  maxAutoMessagesPerDay: number | null

  // ─── Допустимые CRM-действия ─────────────────────────────────────────────
  // Список действий, разрешённых из нашей CRM для кандидатов этого канала.
  allowedActions: AllowedAction[]
}

// ─── Реестр политик ──────────────────────────────────────────────────────────

export const CHANNEL_POLICY: Record<ChannelPolicyChannel, ChannelPolicy> = {
  // hh.ru — пермиссивная политика: площадка не ограничивает наши исходящие.
  hh: {
    forbidExternalLinks: false,
    forbidPhoneInChat: false,
    forbidAutoFirstContactBroadcast: false,
    maxAutoMessagesPerDay: null,
    allowedActions: ["invitation", "discard", "assessment"],
  },

  // Авито — ограничительная политика (черновик — ВЕРИФИЦИРОВАТЬ по docs.avito.ru).
  //
  // ⚠️ До боевого включения:
  //   1. Проверить актуальный список запретов Messenger API на developers.avito.ru
  //   2. Согласовать лимит maxAutoMessagesPerDay с реальными ограничениями API
  //   3. Уточнить, поддерживает ли Авито action "assessment" для вакансий
  avito: {
    forbidExternalLinks: true,
    forbidPhoneInChat: true,
    forbidAutoFirstContactBroadcast: true,
    maxAutoMessagesPerDay: 20, // TODO: верифицировать по документации Авито
    allowedActions: ["invitation", "discard"],
  },
}

// ─── Санитайзер исходящих сообщений ──────────────────────────────────────────

export interface SanitizeResult {
  /** Текст после применения политики (запрещённый контент удалён/заменён). */
  text: string
  /** true — сообщение заблокировано полностью и не должно быть отправлено. */
  blocked: boolean
  /** Причины блокировки/редактирования для логирования. */
  reasons: string[]
}

// Обнаружение внешних ссылок: http(s), t.me, vk.com, wa.me.
const EXTERNAL_LINK_RE = /https?:\/\/[^\s]+|t\.me\/[^\s]+|vk\.com\/[^\s]+|wa\.me\/[^\s]+/gi

// Российские и международные форматы телефонов.
const PHONE_RE =
  /(?:\+7|8)[\s\-(]?\d[\s\-()]{0,2}\d[\s\-()]{0,2}\d[\s\-()]{0,2}\d[\s\-()]{0,2}\d[\s\-()]{0,2}\d[\s\-()]{0,2}\d[\s\-()]{0,2}\d[\s\-()]{0,2}\d\d|\+\d{1,3}[\s\-()]?\d{3}[\s\-().\d]{6,}/g

/**
 * Прогоняет исходящий текст через политику канала.
 *
 * - Если политика запрещает ссылки — заменяет их на «[ссылка удалена]».
 * - Если политика запрещает телефоны — заменяет на «[телефон удалён]».
 * - Если после редактирования текст пустой — blocked=true.
 *
 * @param channel  Канал ("hh" | "avito").
 * @param text     Исходящий текст до отправки.
 */
export function sanitizeOutbound(
  channel: ChannelPolicyChannel,
  text: string,
): SanitizeResult {
  const policy = CHANNEL_POLICY[channel]
  let result = text
  const reasons: string[] = []

  if (policy.forbidExternalLinks) {
    EXTERNAL_LINK_RE.lastIndex = 0
    if (EXTERNAL_LINK_RE.test(result)) {
      EXTERNAL_LINK_RE.lastIndex = 0
      result = result.replace(EXTERNAL_LINK_RE, "[ссылка удалена]")
      reasons.push(`Внешние ссылки запрещены политикой канала ${channel}`)
    }
  }

  if (policy.forbidPhoneInChat) {
    PHONE_RE.lastIndex = 0
    if (PHONE_RE.test(result)) {
      PHONE_RE.lastIndex = 0
      result = result.replace(PHONE_RE, "[телефон удалён]")
      reasons.push(`Телефонные номера запрещены политикой канала ${channel}`)
    }
  }

  // Если после санитизации текст стал пустым/пробельным — блокируем отправку.
  const blocked = result.trim().length === 0

  return { text: result, blocked, reasons }
}
