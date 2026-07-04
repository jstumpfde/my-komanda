// Генератор коротких уникальных кодов для трекинг-ссылок /go/{code}.
// 8 символов base62 (a-zA-Z0-9) из crypto.randomBytes — коллизии по коду
// проверяются на уровне вызывающего (unique index telegram_post_links_code_uq).

import { randomBytes } from "node:crypto"

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
const CODE_LENGTH = 8

export function generateLinkCode(): string {
  const bytes = randomBytes(CODE_LENGTH)
  let code = ""
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length]
  }
  return code
}
