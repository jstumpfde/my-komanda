// Оркестратор (мозг) sales-чатбота. Принимает входные данные и возвращает
// решение — что ответить. НЕ пишет в БД, НЕ отправляет сообщения;
// это забота вызывающего кода (транспорта).
//
// Архитектура 4-слойная, зеркалит HR-chatbot-processor.ts:
//   1. Pre-filter (Haiku) — фильтр входящего сообщения
//   2. Явная просьба позвать человека
//   3. Intent-классификатор (Haiku)
//   4. Генератор (Sonnet) + post-filter (Haiku)

import {
  classifySalesIncoming,
  validateSalesReply,
} from "@/lib/ai/sales-security-filter"
import { callClaudeSonnet } from "@/lib/ai/client"
import {
  classifySalesIntent,
  type SalesIntentCategory,
} from "@/lib/ai/sales-intents"
import {
  resolveSalesChatbotSettings,
  type SalesChatbotSettings,
} from "@/lib/ai/sales-chatbot-settings"
import { buildSalesSystemPrompt } from "@/lib/ai/sales-safety-rules"

// ─── Входные данные ───────────────────────────────────────────────────────────

export interface SalesProcessInput {
  /** Текст входящего сообщения клиента. */
  incomingText: string
  /** Данные callback (например, кнопки quick-reply) — не используются напрямую в логике. */
  callbackData?: string | null
  /** История диалога: последние N ходов, новейшее последним. */
  history?: Array<{ role: "user" | "assistant"; text: string }>
  /** Конфигурация ботa для данной точки контакта (объявления/сервиса). */
  config: {
    isEnabled?: boolean | null
    botName?: string | null
    greeting?: string | null
    systemPrompt?: string | null
    settings?: SalesChatbotSettings | null
  }
  /**
   * Статус разговора. При "paused_for_human" бот молчит — разговор у оператора.
   * Транспорт сам управляет этим статусом, процессор его только читает.
   */
  conversationStatus?: string | null
  /** Контекст услуг/прайса — передаётся в системный промпт для Sonnet. */
  serviceContext?: {
    serviceName?: string | null
    priceRange?: string | null
    contextText?: string | null
  }
  /**
   * dryRun=true — не пишем в БД и не шлём уведомления. На логику процессора
   * не влияет (он и так без БД), но сохраняем паритет с HR-процессором.
   */
  dryRun?: boolean
}

// ─── Результат ───────────────────────────────────────────────────────────────

export interface SalesProcessResult {
  /** true — процессор обработал сообщение (даже если эскалировал). */
  handled: boolean
  /**
   * "sent"      — сгенерировали reply, всё чисто.
   * "escalated" — нужен человек (pre-filter, explicit request, post-filter...).
   * "skipped"   — бот выключен / на паузе / ошибка.
   */
  action: "sent" | "escalated" | "skipped"
  /** Готовый текст ответа — только при action="sent". */
  reply?: string
  /** Классифицированное намерение клиента. */
  category?: SalesIntentCategory
  /** Уверенность intent-классификатора (0-1). */
  confidence?: number
  /** Причина эскалации или пропуска. */
  escalationReason?: string
  /** Короткое предварительное сообщение («Секунду, уточняю…»). */
  preMessage?: string
  /** Задержка перед коротким сообщением, мс. */
  preMessageDelayMs?: number
  /** Задержка перед основным ответом, мс. */
  replyDelayMs?: number
}

// ─── Регулярка для явной просьбы позвать человека ────────────────────────────

// Ловим русскоязычные фразы типа «позовите человека», «хочу с оператором»,
// «свяжите с менеджером» и т.д. Обновлять здесь при появлении новых паттернов.
const HUMAN_REQUEST_RE =
  /оператор|администратор|менеджер|живой\s+человек|позовите\s+человека|свяжите\s+(с|меня)/i

// ─── Главная функция ──────────────────────────────────────────────────────────

/**
 * Оркестратор sales-чатбота.
 *
 * Принимает текст от клиента + конфиг + историю → возвращает решение.
 * Не имеет побочных эффектов: не пишет в БД, не отправляет сообщения,
 * не обращается к внешним сервисам (только к Claude API через client.ts).
 */
export async function processSalesMessage(
  input: SalesProcessInput,
): Promise<SalesProcessResult> {
  try {
    // ── Шаг 1: Проверка флага isEnabled ─────────────────────────────────────
    if (input.config.isEnabled === false) {
      return { handled: false, action: "skipped", escalationReason: "disabled" }
    }

    // ── Шаг 2: Разговор передан живому оператору — бот молчит ───────────────
    if (input.conversationStatus === "paused_for_human") {
      return {
        handled: false,
        action: "skipped",
        escalationReason: "paused_for_human",
      }
    }

    // ── Шаг 3: Получаем полные настройки (дефолты + partial из config) ──────
    const settings = resolveSalesChatbotSettings(input.config.settings)

    // ── Шаг 4: Pre-filter входящего сообщения (Haiku) ────────────────────────
    const pre = await classifySalesIncoming(input.incomingText, {
      context: input.history,
    })

    // Категории и пороги эскалации (зеркалят HR-логику Group 30):
    //   injection   ≥ 0.85 — очень высокий порог, чтобы не ложно срабатывать
    //   code_request ≥ 0.7
    //   severe_abuse ≥ 0.7
    if (
      (pre.category === "injection"    && pre.confidence >= 0.85) ||
      (pre.category === "code_request" && pre.confidence >= 0.7)  ||
      (pre.category === "severe_abuse" && pre.confidence >= 0.7)
    ) {
      return {
        handled: true,
        action: "escalated",
        escalationReason: `pre:${pre.category}`,
      }
    }

    // Остальные категории (normal / mild_negativity / medium_abuse /
    // offtopic / unstable_pattern) — пропускаем дальше.

    // ── Шаг 5: Явная просьба позвать человека ───────────────────────────────
    if (
      settings.escalation.onExplicitRequest &&
      HUMAN_REQUEST_RE.test(input.incomingText)
    ) {
      return {
        handled: true,
        action: "escalated",
        escalationReason: "explicit_human_request",
      }
    }

    // ── Шаг 6: Intent-классификатор (Haiku) ─────────────────────────────────
    const intent = await classifySalesIntent(input.incomingText, {
      context: input.history,
    })

    // ── Шаг 7: Генерация ответа (Sonnet) ────────────────────────────────────
    const system = buildSalesSystemPrompt({
      botName: input.config.botName,
      customPrompt: input.config.systemPrompt,
      serviceContext: input.serviceContext?.contextText,
    })

    const raw = await callClaudeSonnet(input.incomingText, system, 800)
    const reply = raw.trim()

    // Пустой ответ — не рискуем отправлять, эскалируем
    if (!reply) {
      return {
        handled: true,
        action: "escalated",
        escalationReason: "empty_generation",
        category: intent.category,
        confidence: intent.confidence,
      }
    }

    // ── Шаг 8: Post-filter ответа (Haiku) ───────────────────────────────────
    const post = await validateSalesReply(reply, {
      serviceName: input.serviceContext?.serviceName ?? null,
      priceRange: input.serviceContext?.priceRange ?? null,
    })

    if (post.category !== "clean") {
      // Ответ нарушает правила — эскалируем, не отправляем клиенту
      return {
        handled: true,
        action: "escalated",
        escalationReason: `post:${post.category}`,
        category: intent.category,
        confidence: intent.confidence,
      }
    }

    // ── Шаг 9: Тайминги ─────────────────────────────────────────────────────
    const replyDelayMs = (settings.responseTiming.delaySeconds ?? 10) * 1000

    let preMessage: string | undefined
    let preMessageDelayMs: number | undefined

    if (
      settings.responseTiming.enableShortMessages &&
      settings.responseTiming.shortMessages &&
      settings.responseTiming.shortMessages.length > 0
    ) {
      // Выбираем случайную фразу из пула. Ограничение количества коротких
      // сообщений на диалог (maxShortMessagesPerDialog) — забота транспорта.
      const pool = settings.responseTiming.shortMessages
      preMessage = pool[Math.floor(Math.random() * pool.length)]
      preMessageDelayMs =
        (settings.responseTiming.shortToMainDelaySeconds ?? 8) * 1000
    }

    // ── Шаг 10: Успех ───────────────────────────────────────────────────────
    return {
      handled: true,
      action: "sent",
      reply,
      category: intent.category,
      confidence: intent.confidence,
      preMessage,
      preMessageDelayMs,
      replyDelayMs,
    }
  } catch (err) {
    // Неожиданная ошибка — логируем и возвращаем безопасный «skipped».
    // Не заглушаем ошибки внутри шагов: каждый шаг сам обрабатывает свои
    // исключения (security-filter, client.ts), здесь ловим только непредвиденное.
    console.warn("[sales-chatbot-processor] unexpected error:", err)
    return { handled: false, action: "skipped", escalationReason: "error" }
  }
}
