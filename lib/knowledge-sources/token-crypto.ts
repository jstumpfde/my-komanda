// Шифрование токенов подключённых источников знаний (Яндекс.Диск и т.д.) —
// AES-256-GCM через встроенный node:crypto. Прецедент для всех будущих
// диск-интеграций (см. концепт kb-connected-sources §risks: «Публичный
// /uploads и plain-text токены — существующие дыры, которые фича обострит»).
//
// Ключ — INTEGRATION_TOKEN_KEY (32 байта, base64). Сгенерировать:
//   openssl rand -base64 32
// Добавить в .env сервера, перезапустить процесс (pm2 reload --update-env).
//
// Модуль НЕ бросает ошибку при импорте/сборке, если ключа нет — только при
// реальной попытке зашифровать/расшифровать (getKey() вызывается лениво
// внутри encryptToken/decryptToken), чтобы отсутствие env не валило build.

import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto"

const ALGO = "aes-256-gcm"
const IV_LENGTH = 12 // рекомендованная длина IV для GCM

function getKey(): Buffer {
  const b64 = process.env.INTEGRATION_TOKEN_KEY
  if (!b64) {
    throw new Error(
      "INTEGRATION_TOKEN_KEY не задан на сервере. Сгенерируйте: `openssl rand -base64 32`, " +
      "добавьте в .env и перезапустите процесс (pm2 reload --update-env). " +
      "Подключение источников знаний недоступно без этого ключа.",
    )
  }
  let key: Buffer
  try {
    key = Buffer.from(b64, "base64")
  } catch {
    throw new Error("INTEGRATION_TOKEN_KEY повреждён (не декодируется как base64)")
  }
  if (key.length !== 32) {
    throw new Error(
      `INTEGRATION_TOKEN_KEY должен декодироваться в 32 байта, получено ${key.length}. ` +
      "Сгенерируйте заново: `openssl rand -base64 32`",
    )
  }
  return key
}

export function isTokenCryptoConfigured(): boolean {
  return Boolean(process.env.INTEGRATION_TOKEN_KEY)
}

/** Формат: base64(iv).base64(authTag).base64(ciphertext) */
export function encryptToken(plain: string): string {
  const key = getKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGO, key, iv)
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`
}

export function decryptToken(payload: string): string {
  const key = getKey()
  const parts = payload.split(".")
  if (parts.length !== 3) {
    throw new Error("Повреждённый шифрованный токен (неверный формат)")
  }
  const [ivB64, tagB64, dataB64] = parts
  const iv = Buffer.from(ivB64, "base64")
  const tag = Buffer.from(tagB64, "base64")
  const data = Buffer.from(dataB64, "base64")
  const decipher = createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()])
  return decrypted.toString("utf8")
}
