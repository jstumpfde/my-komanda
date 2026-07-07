// Rate-limit для публичных промо-эндпоинтов модуля «Типология»
// (POST /api/public/tip/promo и /api/public/tip/free/[token]).
//
// ДВА слоя (guard-major 07.07 — cookie-лимит обходится сбросом cookie: сервер
// сам создаёт нового anon-юзера на каждый безкуковый запрос):
// 1. По tip_uid — от долбёжки с одного устройства.
// 2. По IP (sha256(ip+secret)) — от брутфорса личных кодов со сбросом cookie;
//    проверяется ДО создания анонимного пользователя. Личный код теперь
//    60-битный (lib/tip/personal-code.ts), IP-лимит добивает остаточный риск.
//
// Хранилище — общий in-memory store из lib/rate-limit.ts (на инстанс PM2,
// прод — один инстанс, этого достаточно).

import { createHash } from "crypto"
import type { NextRequest } from "next/server"
import { checkRateLimit } from "@/lib/rate-limit"

const MAX_ATTEMPTS_PER_WINDOW = 10
const WINDOW_MS = 10 * 60 * 1000 // 10 минут

// По IP щедрее (NAT: офис/кампус за одним адресом), но всё ещё смертельно
// для перебора: 60 попыток / 10 мин ≈ 8.6k/сутки против 2^60 комбинаций.
const MAX_IP_ATTEMPTS_PER_WINDOW = 60

export const TIP_RATE_LIMIT_MESSAGE = "Слишком много попыток — попробуйте позже"

/**
 * Проверяет лимит попыток промо-эндпоинтов для данного tip_uid.
 * @returns true — запрос разрешён; false — лимит исчерпан (роут должен
 * вернуть 429 с TIP_RATE_LIMIT_MESSAGE).
 */
export function checkTipPromoRateLimit(tipUid: string): boolean {
  return checkRateLimit(`tip-promo:${tipUid}`, MAX_ATTEMPTS_PER_WINDOW, WINDOW_MS)
}

/**
 * IP-лимит промо-эндпоинтов. Вызывать ПЕРВЫМ, до getOrCreateTipUser —
 * иначе каждый безкуковый запрос брутфорсера ещё и создаёт строку tip_users.
 */
export function checkTipPromoIpRateLimit(req: NextRequest): boolean {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  const key = createHash("sha256")
    .update(ip + (process.env.NEXTAUTH_SECRET ?? ""))
    .digest("hex")
    .slice(0, 16)
  return checkRateLimit(`tip-promo-ip:${key}`, MAX_IP_ATTEMPTS_PER_WINDOW, WINDOW_MS)
}
