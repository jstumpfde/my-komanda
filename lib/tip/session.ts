// Анонимная идентификация пользователя модуля «Типология» (веб, /tip).
//
// Отдельная сущность от users платформы (см. lib/db/schema.ts → tipUsers):
// посетитель /tip не логинится, его личность — httpOnly cookie tip_uid
// (uuid, 1 год, path=/). getOrCreateTipUser() читает её через next/headers
// (см. lib/partner/impersonation.ts — тот же паттерн cookies() в App Router
// route handlers) и находит/создаёт строку tip_users. Если куки ещё не было —
// функция сама выставляет её на mutable cookies() (доступно в route handlers,
// см. Next.js docs — cookies().set() работает в Server Actions и Route Handlers).

import { cookies } from "next/headers"
import { randomUUID } from "crypto"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { tipUsers, type TipUser } from "@/lib/db/schema"

export const TIP_UID_COOKIE = "tip_uid"
const TIP_UID_MAX_AGE_SECONDS = 60 * 60 * 24 * 365 // 1 год

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Возвращает (создавая при необходимости) анонимного пользователя модуля
 * «Типология» для текущего запроса. Идентификация — httpOnly cookie tip_uid.
 *
 * Если cookie отсутствует/невалидна — генерирует новый uuid, создаёт строку
 * tip_users и выставляет cookie на 1 год. Если cookie указывает на
 * несуществующую строку (например БД сбросили) — тоже создаёт новую строку
 * с ЭТИМ ЖЕ uuid (id зачастую совпадает со значением cookie, см. ниже) —
 * fallback на новый uuid, если конфликт.
 */
export async function getOrCreateTipUser(): Promise<TipUser> {
  const cookieStore = await cookies()
  const existingUid = cookieStore.get(TIP_UID_COOKIE)?.value

  if (existingUid && UUID_RE.test(existingUid)) {
    const [found] = await db.select().from(tipUsers).where(eq(tipUsers.id, existingUid)).limit(1)
    if (found) return found
  }

  // Нет валидной cookie либо строка не найдена — создаём нового пользователя.
  // id генерируем сами (а не полагаемся на defaultRandom()), чтобы cookie и
  // id строки совпадали — тогда повторный визит без БД-джойна узнаёт себя.
  const newUid = existingUid && UUID_RE.test(existingUid) ? existingUid : randomUUID()

  const [created] = await db
    .insert(tipUsers)
    .values({ id: newUid })
    .onConflictDoNothing({ target: tipUsers.id })
    .returning()

  const user = created ?? (await db.select().from(tipUsers).where(eq(tipUsers.id, newUid)).limit(1))[0]

  cookieStore.set({
    name: TIP_UID_COOKIE,
    value: newUid,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TIP_UID_MAX_AGE_SECONDS,
  })

  return user
}
