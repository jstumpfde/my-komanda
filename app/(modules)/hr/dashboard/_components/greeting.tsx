"use client"

/**
 * Получить текущий час в Europe/Moscow timezone.
 * Используется на клиенте; работает независимо от часового пояса машины.
 */
function getMoscowHour(): number {
  const parts = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    hour: "numeric",
    hour12: false,
  }).formatToParts(new Date())
  const hourPart = parts.find(p => p.type === "hour")?.value ?? "0"
  // formatToParts может вернуть "24" вместо "0" в некоторых рантаймах
  const h = parseInt(hourPart, 10)
  return Number.isFinite(h) ? h % 24 : 0
}

/**
 * Возвращает приветствие по часу в Москве:
 *  0–4   → "Доброй ночи"
 *  5–11  → "Доброе утро"
 *  12–17 → "Добрый день"
 *  18–23 → "Добрый вечер"
 */
export function getGreeting(): string {
  const h = getMoscowHour()
  if (h <= 4) return "Доброй ночи"
  if (h <= 11) return "Доброе утро"
  if (h <= 17) return "Добрый день"
  return "Добрый вечер"
}

export function Greeting() {
  return (
    <h2 className="text-2xl font-semibold" suppressHydrationWarning>
      {getGreeting()}
    </h2>
  )
}
