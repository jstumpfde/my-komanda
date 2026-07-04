// Шифрование session_string (StringSession GramJS) перед записью в БД.
// AES-256-GCM, ключ — 32 байта hex в env TELEGRAM_SESSION_KEY.
// Формат хранения: "<iv base64>:<authTag base64>:<ciphertext base64>".
//
// Сгенерировать ключ:  openssl rand -hex 32

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

const ALGO = "aes-256-gcm"
const IV_LENGTH = 12 // рекомендуемая длина IV для GCM

function getKey(): Buffer {
  const hex = process.env.TELEGRAM_SESSION_KEY
  if (!hex) {
    throw new Error(
      "TELEGRAM_SESSION_KEY не задан в env — нужен 32-байтный ключ в hex (openssl rand -hex 32), " +
      "иначе подключение Telegram-аккаунта невозможно (сессия хранится только зашифрованной)."
    )
  }
  const key = Buffer.from(hex, "hex")
  if (key.length !== 32) {
    throw new Error(
      `TELEGRAM_SESSION_KEY должен декодироваться в 32 байта (получено ${key.length}) — ` +
      "проверь, что значение сгенерировано через openssl rand -hex 32."
    )
  }
  return key
}

export function encryptSessionString(plain: string): string {
  const key = getKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGO, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`
}

export function decryptSessionString(stored: string): string {
  const key = getKey()
  const parts = stored.split(":")
  if (parts.length !== 3) {
    throw new Error("Повреждённый формат зашифрованной сессии Telegram (ожидалось iv:tag:ciphertext)")
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
