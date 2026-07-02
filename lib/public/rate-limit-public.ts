import { NextRequest } from "next/server"
import { checkRateLimit } from "@/lib/rate-limit"

// Rate-limit для ПУБЛИЧНЫХ токен-роутов (/demo/[token], /test/[token], schedule).
//
// ЗАЧЕМ: часть живых ссылок кандидатов резолвится по КОРОТКОМУ и ПРЕДСКАЗУЕМОМУ
// short_id (формат 2604V0010042 = YYMM + Vсеквенция + 4-значный номер кандидата,
// см. lib/short-id.ts). Он используется как единственный секрет ссылки. Без
// ограничителя перебором можно (а) выгрузить PII любого кандидата, (б) писать
// ответы/бронировать интервью за него. Формат старых ссылок НЕ меняем (кандидаты
// по ним ходят) — вместо этого режем перебор по IP.
//
// Порог подобран так, чтобы НЕ мешать реальному кандидату: демо шлёт ответы
// батчами, страница делает несколько GET-ов. 120 запросов в минуту на один IP —
// это с запасом для живого прохождения, но обрубает массовый скан (тысячи id).
//
// Хранилище — общий in-memory store из lib/rate-limit (на инстанс). Для текущего
// одно-инстансного прода этого достаточно; при кластере лимит станет per-instance
// (всё равно кратно режет перебор).

function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for")
  if (xff) {
    const first = xff.split(",")[0]?.trim()
    if (first) return first
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown"
}

/**
 * Проверяет лимит для публичного токен-роута по IP.
 * @returns true — запрос разрешён; false — превышен лимит (роут должен вернуть 429).
 */
export function checkPublicTokenRateLimit(
  req: NextRequest,
  scope: string,
  maxPerMinute = 120,
): boolean {
  const ip = clientIp(req)
  return checkRateLimit(`public-token:${scope}:${ip}`, maxPerMinute, 60 * 1000)
}
