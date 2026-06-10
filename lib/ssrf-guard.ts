/**
 * SSRF-защита: блокирует запросы к приватным/loopback/link-local адресам.
 *
 * Применяется перед любым fetch к URL из пользовательского ввода:
 *   - lib/webhooks.ts
 *   - lib/bitrix.ts
 *   - app/api/core/fetch-url/route.ts
 *   - app/api/modules/knowledge/ai-courses/fetch-url/route.ts
 */

import { lookup } from "dns/promises"

// Диапазоны приватных/loopback/link-local IPv4
const PRIVATE_RANGES_V4: Array<{ prefix: number[]; bits: number }> = [
  { prefix: [127], bits: 8 },           // 127.0.0.0/8  loopback
  { prefix: [10], bits: 8 },            // 10.0.0.0/8   private
  { prefix: [172, 16], bits: 12 },      // 172.16.0.0/12 private
  { prefix: [192, 168], bits: 16 },     // 192.168.0.0/16 private
  { prefix: [169, 254], bits: 16 },     // 169.254.0.0/16 link-local
  { prefix: [100, 64], bits: 10 },      // 100.64.0.0/10 shared (CGN)
  { prefix: [0], bits: 8 },             // 0.0.0.0/8
  { prefix: [255, 255, 255, 255], bits: 32 }, // broadcast
]

const PRIVATE_HOSTS = new Set([
  "localhost",
  "ip6-localhost",
  "ip6-loopback",
])

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number)
  if (parts.length !== 4 || parts.some(isNaN)) return false

  for (const { prefix, bits } of PRIVATE_RANGES_V4) {
    const full = [...prefix]
    // Проверяем совпадение префикса побайтово до bits
    const fullBytes = Math.floor(bits / 8)
    let match = true
    for (let i = 0; i < fullBytes && i < full.length; i++) {
      if (parts[i] !== full[i]) { match = false; break }
    }
    if (match && fullBytes >= full.length) return true
    // Для /12: 172.16-31
    if (bits === 12 && parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
    // Для /10: 100.64-127
    if (bits === 10 && parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true
  }
  return false
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, "")
  return (
    lower === "::1" ||
    lower.startsWith("::ffff:127.") ||
    lower.startsWith("fe80:") ||       // link-local
    lower.startsWith("fc") ||          // unique local
    lower.startsWith("fd")             // unique local
  )
}

/**
 * Выбрасывает ошибку, если URL ведёт на приватный/loopback/link-local адрес.
 * Резолвит hostname через DNS перед проверкой.
 *
 * Для безопасности resolve обязателен, чтобы исключить DNS rebinding:
 * hostname вроде "evil.com" может резолвиться в 127.0.0.1.
 *
 * @throws Error — если URL приватный или hostname не резолвится
 */
export async function assertPublicUrl(urlString: string): Promise<void> {
  let parsed: URL
  try {
    parsed = new URL(urlString)
  } catch {
    throw new Error("Некорректный URL")
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Разрешены только http/https URL")
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "")

  // Проверить известные приватные хостнеймы
  if (PRIVATE_HOSTS.has(hostname)) {
    throw new Error("Запросы к внутренним адресам запрещены")
  }

  // Если хостнейм уже IP — проверяем напрямую
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    if (isPrivateIPv4(hostname)) {
      throw new Error("Запросы к внутренним адресам запрещены")
    }
    return
  }
  if (hostname.includes(":")) {
    if (isPrivateIPv6(hostname)) {
      throw new Error("Запросы к внутренним адресам запрещены")
    }
    return
  }

  // Резолвим через DNS и проверяем все адреса
  let addresses: string[]
  try {
    const results = await lookup(hostname, { all: true })
    addresses = results.map((r) => r.address)
  } catch {
    throw new Error(`Не удалось резолвить хост: ${hostname}`)
  }

  for (const addr of addresses) {
    if (isPrivateIPv4(addr) || isPrivateIPv6(addr)) {
      throw new Error("Запросы к внутренним адресам запрещены")
    }
  }
}
