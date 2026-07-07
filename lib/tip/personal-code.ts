// lib/tip/personal-code.ts
// Личный код-пропуск (0265) — код-пароль, который "логинит" браузер в
// конкретный аккаунт модуля «Типология» (см. lib/tip/service.ts::
// activatePromo, ветка is_personal, и lib/tip/session.ts::switchTipUserCookie).
//
// Формат длиннее обычных промокодов (app/api/admin/tip/promo-codes/route.ts:
// 3 буквы + 4 цифры) — TIP + 4 буквы + 4 цифры, например TIPKHBX2622.
// Визуально отличим от обычного кода и достаточно энтропии — код фактически
// пароль в аккаунт.

import { randomBytes } from "crypto"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { tipPromoCodes } from "@/lib/db/schema"

// Буквы — подмножество, визуально совпадающее с кириллицей (легко
// продиктовать/перепечатать с любой раскладки), цифры 2-9 (без 0/1, чтобы не
// путать с О/I). Тот же алфавит, что и обычные коды — см.
// app/api/admin/tip/promo-codes/route.ts.
const LETTERS_ALPHABET = "ABCEHKMPTX"
const DIGITS_ALPHABET = "23456789"

function randomFromAlphabet(len: number, alphabet: string): string {
  const bytes = randomBytes(len)
  let out = ""
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length]
  return out
}

function generatePersonalCode(): string {
  return `TIP${randomFromAlphabet(4, LETTERS_ALPHABET)}${randomFromAlphabet(4, DIGITS_ALPHABET)}`
}

/**
 * Возвращает (создавая при необходимости) личный код-пропуск пользователя.
 * Идемпотентно: если у пользователя уже есть личный код — возвращает его,
 * новый не создаёт (частичный уникальный индекс tip_promo_codes_owner_
 * personal_uq в 0265 гарантирует не больше одного личного кода на юзера —
 * при гонке двух параллельных вызовов unique_violation ловим и перечитываем).
 */
export async function ensurePersonalCode(userId: string): Promise<string> {
  const [existing] = await db
    .select()
    .from(tipPromoCodes)
    .where(and(eq(tipPromoCodes.ownerUserId, userId), eq(tipPromoCodes.isPersonal, true)))
    .limit(1)
  if (existing) return existing.code

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generatePersonalCode()
    try {
      const [row] = await db
        .insert(tipPromoCodes)
        .values({
          code,
          runsGranted: 0, // личный код не начисляет прогоны — см. activatePromo
          isPersonal: true,
          ownerUserId: userId,
          sourceLabel: "personal",
        })
        .returning()
      if (row) return row.code
    } catch (e) {
      // Postgres unique_violation — drizzle-orm заворачивает driver-ошибку в
      // DrizzleQueryError, где .code лежит на .cause, не на самой ошибке
      // (см. lib/tip/service.ts::isUniqueViolation).
      const code = (e as { code?: string })?.code ?? (e as { cause?: { code?: string } })?.cause?.code
      if (code === "23505") {
        // Либо гонка (у юзера уже появился личный код от параллельного
        // вызова — ловит tip_promo_codes_owner_personal_uq), либо коллизия
        // значения кода (крайне маловероятно) — перечитываем и решаем.
        const [refetched] = await db
          .select()
          .from(tipPromoCodes)
          .where(and(eq(tipPromoCodes.ownerUserId, userId), eq(tipPromoCodes.isPersonal, true)))
          .limit(1)
        if (refetched) return refetched.code
        continue
      }
      throw e
    }
  }
  throw new Error("Не удалось сгенерировать уникальный личный код за 5 попыток")
}
