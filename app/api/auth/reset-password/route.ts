import { NextRequest } from "next/server"
import crypto from "node:crypto"
import bcrypt from "bcryptjs"
import { eq, and, isNull, gt } from "drizzle-orm"
import { db } from "@/lib/db"
import { users, passwordResetTokens } from "@/lib/db/schema"
import { apiError, apiSuccess } from "@/lib/api-helpers"

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex")
}

function isValidPassword(password: string): boolean {
  if (password.length < 8) return false
  if (!/[A-Za-zА-Яа-яЁё]/.test(password)) return false
  if (!/[0-9]/.test(password)) return false
  return true
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as {
      token?: unknown
      newPassword?: unknown
    }

    const token = typeof body.token === "string" ? body.token.trim() : ""
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : ""

    if (!token) {
      return apiError("invalid_or_expired_token", 400)
    }
    if (!isValidPassword(newPassword)) {
      return apiError("Пароль должен содержать минимум 8 символов, хотя бы 1 букву и 1 цифру", 400)
    }

    const tokenHash = hashToken(token)

    const [record] = await db
      .select({
        id:        passwordResetTokens.id,
        userId:    passwordResetTokens.userId,
        expiresAt: passwordResetTokens.expiresAt,
        usedAt:    passwordResetTokens.usedAt,
      })
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.tokenHash, tokenHash),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, new Date()),
        ),
      )
      .limit(1)

    if (!record) {
      return apiError("invalid_or_expired_token", 400)
    }

    const passwordHash = await bcrypt.hash(newPassword, 10)

    await db.update(users)
      .set({ passwordHash })
      .where(eq(users.id, record.userId))

    await db.update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, record.id))

    return apiSuccess({ ok: true })
  } catch (err) {
    console.error("[reset-password] error:", err)
    return apiError("invalid_or_expired_token", 400)
  }
}
