// Шифрование credentialsEnc в rop_channel_connectors (пароли IMAP-ящиков,
// токены Telegram-ботов, API-ключи WhatsApp-агрегаторов).
// AES-256-GCM, ключ — 32 байта hex в env SALESRADAR_CRED_KEY.
// По образцу lib/telegram-posting/crypto.ts (encryptSessionString/decrypt),
// но работает с произвольным JSON-объектом кредов, а не с одной строкой.
//
// Сгенерировать ключ:  openssl rand -hex 32

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

const ALGO = "aes-256-gcm"
const IV_LENGTH = 12 // рекомендуемая длина IV для GCM

function getKey(): Buffer {
  const hex = process.env.SALESRADAR_CRED_KEY
  if (!hex) {
    throw new Error(
      "SALESRADAR_CRED_KEY не задан в env — нужен 32-байтный ключ в hex (openssl rand -hex 32), " +
      "иначе креды коннекторов SalesRadar нельзя ни зашифровать, ни расшифровать."
    )
  }
  const key = Buffer.from(hex, "hex")
  if (key.length !== 32) {
    throw new Error(
      `SALESRADAR_CRED_KEY должен декодироваться в 32 байта (получено ${key.length}) — ` +
      "проверь, что значение сгенерировано через openssl rand -hex 32."
    )
  }
  return key
}

function encryptString(plain: string): string {
  const key = getKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGO, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`
}

function decryptString(stored: string): string {
  const key = getKey()
  const parts = stored.split(":")
  if (parts.length !== 3) {
    throw new Error("Повреждённый формат зашифрованных кредов SalesRadar (ожидалось iv:tag:ciphertext)")
  }
  const [ivB64, tagB64, dataB64] = parts
  const iv = Buffer.from(ivB64, "base64")
  const tag = Buffer.from(tagB64, "base64")
  const data = Buffer.from(dataB64, "base64")
  const decipher = createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  const plain = Buffer.concat([decipher.update(data), decipher.final()])
  return plain.toString("utf8")
}

/**
 * Шифрует произвольный объект кредов коннектора для credentialsEnc (jsonb).
 * Хранится как { enc: "<iv:tag:ciphertext>" } — сам jsonb-контейнер открытый,
 * но значение внутри — шифротекст, читаемый только с SALESRADAR_CRED_KEY.
 */
export function encryptConnectorCreds(creds: Record<string, unknown>): { enc: string } {
  return { enc: encryptString(JSON.stringify(creds)) }
}

export function decryptConnectorCreds<T = Record<string, unknown>>(stored: unknown): T {
  if (!stored || typeof stored !== "object" || !("enc" in stored) || typeof (stored as { enc?: unknown }).enc !== "string") {
    throw new Error("credentialsEnc пуст или повреждён — переподключите канал")
  }
  const plain = decryptString((stored as { enc: string }).enc)
  return JSON.parse(plain) as T
}
