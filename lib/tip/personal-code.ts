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

// Личный код — фактически пароль в аккаунт (активация переключает cookie на
// владельца), поэтому энтропия здесь ВЫШЕ, чем у обычных промокодов:
// 12 символов 32-символьного алфавита = 60 бит (guard-major 07.07: прежний
// формат 4+4 давал ~25 бит — брутфорсится). Код не диктуют голосом — его
// копируют из бота (/code), поэтому длина UX не мешает.
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ" // без 0/O/1/I
const PERSONAL_CODE_RANDOM_LEN = 12

function randomFromAlphabet(len: number, alphabet: string): string {
  const bytes = randomBytes(len)
  let out = ""
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length]
  return out
}

function generatePersonalCode(): string {
  return `TIP${randomFromAlphabet(PERSONAL_CODE_RANDOM_LEN, CODE_ALPHABET)}`
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
