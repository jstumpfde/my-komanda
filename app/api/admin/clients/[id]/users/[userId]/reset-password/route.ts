import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { requirePlatformAdmin, apiError, apiSuccess } from "@/lib/api-helpers"
import bcrypt from "bcryptjs"
import { randomBytes } from "crypto"

type Params = { params: Promise<{ id: string; userId: string }> }

/**
 * Генерирует надёжный временный пароль (14 символов):
 * буквы (верхний + нижний регистр), цифры и спецсимволы.
 * Использует crypto.randomBytes — без внешних пакетов.
 */
function generateTempPassword(): string {
  const upper   = "ABCDEFGHJKLMNPQRSTUVWXYZ"
  const lower   = "abcdefghjkmnpqrstuvwxyz"
  const digits  = "23456789"
  const special = "!@#$%^&*"
  const all = upper + lower + digits + special

  // Гарантируем хотя бы по одному символу каждого класса
  const mandatory = [
    upper[randomBytes(1)[0]! % upper.length]!,
    lower[randomBytes(1)[0]! % lower.length]!,
    digits[randomBytes(1)[0]! % digits.length]!,
    special[randomBytes(1)[0]! % special.length]!,
  ]

  // Добавляем ещё 10 случайных символов (итого 14)
  const extra = Array.from({ length: 10 }, () =>
    all[randomBytes(1)[0]! % all.length]!
  )

  // Перемешиваем через Fisher-Yates с crypto-рандомом
  const chars = [...mandatory, ...extra]
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomBytes(1)[0]! % (i + 1)
    ;[chars[i], chars[j]] = [chars[j]!, chars[i]!]
  }
  return chars.join("")
}

// POST /api/admin/clients/[id]/users/[userId]/reset-password
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    await requirePlatformAdmin()
  } catch (e) {
    return e as Response
  }

  const { id: companyId, userId } = await params

  // Проверяем принадлежность пользователя компании
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.companyId, companyId)))
    .limit(1)

  if (!user) return apiError("Пользователь не найден", 404)

  const tempPassword = generateTempPassword()
  const passwordHash = await bcrypt.hash(tempPassword, 10)

  await db
    .update(users)
    .set({ passwordHash, isActive: true })
    .where(eq(users.id, userId))

  // plaintext возвращается только в этом ответе, нигде не логируется
  return apiSuccess({ password: tempPassword })
}
