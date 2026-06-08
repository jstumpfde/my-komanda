// Экстрактор подтверждения записи из диалога клиента с ботом-администратором салона.
// Определяет, согласился ли клиент на КОНКРЕТНУЮ запись, и извлекает её поля.
// Используется перед созданием предварительной брони.

import { callClaudeHaiku } from "@/lib/ai/client"

// ─── Типы ────────────────────────────────────────────────────────────────────

/** Результат извлечения подтверждения записи из диалога */
export interface BookingExtraction {
  /** Клиент явно подтвердил конкретную запись (услуга + время понятны) */
  shouldBook: boolean
  /** Название услуги — как написано в данных салона */
  serviceName: string | null
  /** Абсолютная дата в формате YYYY-MM-DD (относительные даты разрешены по todayISO) */
  date: string | null
  /** Время в формате HH:MM (24ч) */
  time: string | null
  /** Имя мастера, если назван в диалоге; иначе null */
  masterName: string | null
  /** Уверенность модели: 0..1 */
  confidence: number
}

/** Фолбэк при ошибке парсинга или неопределённости */
const EMPTY_EXTRACTION: BookingExtraction = {
  shouldBook: false,
  serviceName: null,
  date: null,
  time: null,
  masterName: null,
  confidence: 0,
}

// ─── Основная функция ─────────────────────────────────────────────────────────

/**
 * Анализирует диалог клиента с ботом и определяет, подтвердил ли клиент
 * конкретную запись. При ошибке или неопределённости возвращает EMPTY_EXTRACTION.
 *
 * @param params.history           — история диалога (все ходы до текущего момента)
 * @param params.latestClientText  — последнее сообщение клиента
 * @param params.latestBotReply    — последний ответ бота, на который клиент реагирует
 * @param params.serviceContextText — список услуг/мастеров/слотов из данных салона (необязательно)
 * @param params.todayISO          — сегодняшняя дата YYYY-MM-DD (для разрешения «завтра», «в пятницу»)
 */
export async function extractBookingConfirmation(params: {
  history: Array<{ role: "user" | "assistant"; text: string }>
  latestClientText: string
  latestBotReply: string
  serviceContextText?: string | null
  todayISO: string
}): Promise<BookingExtraction> {
  const { history, latestClientText, latestBotReply, serviceContextText, todayISO } = params

  // Формируем блок истории (последние 8 ходов для контекста, без последнего сообщения клиента)
  const historyBlock =
    history.length > 0
      ? `\nИстория диалога (последние ходы):\n${history
          .slice(-8)
          .map(m => `${m.role === "user" ? "Клиент" : "Администратор"}: ${m.text}`)
          .join("\n")}\n`
      : ""

  // Блок с данными о доступных услугах/мастерах/слотах (если передан)
  const serviceBlock = serviceContextText
    ? `\nДанные салона (услуги / мастера / доступные слоты):\n${serviceContextText}\n`
    : ""

  const prompt = `Ты — анализатор диалогов клиента с ботом-администратором салона красоты/услуг.
Твоя задача: определить, подтвердил ли клиент запись ИМЕННО в последнем своём сообщении.

Сегодняшняя дата: ${todayISO} (используй для разрешения относительных дат).
${historyBlock}${serviceBlock}
Последний ответ администратора (бота):
"${latestBotReply}"

Последнее сообщение клиента (которое нужно проанализировать):
"${latestClientText}"

ПРАВИЛА:
1. shouldBook = true ТОЛЬКО если клиент ЯВНО согласился прямо сейчас И понятны услуга И время.
   Примеры согласия: «да, записывайте», «ок, 18:00 подойдёт», «давайте в пятницу в 14:00», «подходит, беру».
   Примеры НЕ-согласия: «а что есть в субботу?», «сколько стоит маникюр?», «подумаю», «может быть».

2. serviceName: найди услугу в данных салона и верни ровно так, как она там написана.
   Если данных нет — извлеки из диалога. Если не понятно — null.

3. date: верни YYYY-MM-DD.
   Разрешение относительных дат относительно todayISO=${todayISO}:
   - «сегодня» → todayISO
   - «завтра» → todayISO + 1 день
   - «послезавтра» → todayISO + 2 дня
   - «в пятницу» / «в субботу» и т.п. → ближайший такой день недели от todayISO
   Если дата не упомянута явно, но из контекста однозначно выводима — выведи.
   Если дата неизвестна — null.

4. time: формат HH:MM (24ч). «6 вечера» → 18:00. Если не указано — null.

5. masterName: имя мастера, если клиент его назвал или подтвердил. Иначе null.

6. confidence: 0.0–1.0. Высокое (>0.8) только если явное согласие + все ключевые поля есть.
   При любом сомнении снижай. При shouldBook=false confidence тоже низкий.

Верни ТОЛЬКО JSON без markdown:
{
  "shouldBook": true/false,
  "serviceName": "...",
  "date": "YYYY-MM-DD",
  "time": "HH:MM",
  "masterName": "...",
  "confidence": 0.0
}`

  // Вызываем Haiku: 300 токенов достаточно для компактного JSON-ответа
  let raw: string
  try {
    raw = await callClaudeHaiku(prompt, undefined, 300)
  } catch {
    // Сетевая или API ошибка — возвращаем безопасный фолбэк
    return EMPTY_EXTRACTION
  }

  // Извлекаем JSON-объект устойчиво к мусору вокруг и ```json-обёрткам
  const m = raw.match(/\{[\s\S]*\}/)
  if (!m) return EMPTY_EXTRACTION

  try {
    const parsed = JSON.parse(m[0]) as Partial<BookingExtraction>

    return {
      shouldBook: parsed.shouldBook === true,
      serviceName: typeof parsed.serviceName === "string" ? parsed.serviceName : null,
      date: typeof parsed.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date)
        ? parsed.date
        : null,
      time: typeof parsed.time === "string" && /^\d{2}:\d{2}$/.test(parsed.time)
        ? parsed.time
        : null,
      masterName: typeof parsed.masterName === "string" ? parsed.masterName : null,
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
    }
  } catch {
    // JSON.parse упал — возвращаем фолбэк
    return EMPTY_EXTRACTION
  }
}
