// Лёгкий rate-limit для публичных промо-эндпоинтов модуля «Типология»
// (POST /api/public/tip/promo и /api/public/tip/free/[token]).
//
// Без ограничителя злоумышленник с одним tip_uid (cookie) мог бы перебирать
// промокоды/бесплатные ссылки методом brute-force. Ключ — tip_uid, НЕ IP:
// куки одноразовые (перебор кодом сброса cookie обходит лимит по одному
// tip_uid, но тогда каждая попытка — это ещё и новая строка tip_users +
// новый визит, что уже не «десять запросов в секунду», см. также анти-фрод
// по ip_hash в lib/tip/referral.ts для смежной защиты).
//
// Хранилище — общий in-memory store из lib/rate-limit.ts (на инстанс PM2,
// прод — один инстанс, этого достаточно).

import { checkRateLimit } from "@/lib/rate-limit"

const MAX_ATTEMPTS_PER_WINDOW = 10
const WINDOW_MS = 10 * 60 * 1000 // 10 минут

export const TIP_RATE_LIMIT_MESSAGE = "Слишком много попыток — попробуйте позже"

/**
 * Проверяет лимит попыток промо-эндпоинтов для данного tip_uid.
 * @returns true — запрос разрешён; false — лимит исчерпан (роут должен
 * вернуть 429 с TIP_RATE_LIMIT_MESSAGE).
 */
export function checkTipPromoRateLimit(tipUid: string): boolean {
  return checkRateLimit(`tip-promo:${tipUid}`, MAX_ATTEMPTS_PER_WINDOW, WINDOW_MS)
}
