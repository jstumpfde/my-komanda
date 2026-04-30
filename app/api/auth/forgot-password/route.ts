import { NextRequest } from "next/server"
import crypto from "node:crypto"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { users, passwordResetTokens } from "@/lib/db/schema"
import { apiSuccess } from "@/lib/api-helpers"
import { sendEmail } from "@/lib/email/smtp"
import { passwordResetEmail } from "@/lib/email/templates"

// Один и тот же ответ независимо от существования юзера —
// защита от user enumeration.
const GENERIC_OK = {
  ok: true as const,
  message: "Если такой email зарегистрирован, мы отправили письмо",
}

// Простой in-memory rate limit: не больше 3 запросов с email за 15 минут.
// При перезапуске процесса сбрасывается — этого достаточно для базовой защиты.
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000
const RATE_LIMIT_MAX = 3
const rateLimitMap = new Map<string, number[]>()

function checkRateLimit(email: string): boolean {
  const now = Date.now()
  const cutoff = now - RATE_LIMIT_WINDOW_MS
  const previous = rateLimitMap.get(email)?.filter((t) => t > cutoff) ?? []
  if (previous.length >= RATE_LIMIT_MAX) {
    rateLimitMap.set(email, previous)
    return false
  }
  previous.push(now)
  rateLimitMap.set(email, previous)
  return true
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex")
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { email?: unknown }
    const email = (typeof body.email === "string" ? body.email : "").trim().toLowerCase()

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return apiSuccess(GENERIC_OK)
    }

    if (!checkRateLimit(email)) {
      return apiSuccess(GENERIC_OK)
    }

    const [user] = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.email, email))
      .limit(1)

    if (!user) {
      return apiSuccess(GENERIC_OK)
    }

    const token = crypto.randomBytes(32).toString("hex")
    const tokenHash = hashToken(token)
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || req.headers.get("x-real-ip")
      || null
    const userAgent = req.headers.get("user-agent") || null

    await db.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash,
      expiresAt,
      ipAddress: ip ?? null,
      userAgent,
    })

    const baseUrl = process.env.NEXTAUTH_URL || "https://company24.pro"
    const resetUrl = `${baseUrl.replace(/\/$/, "")}/reset-password?token=${token}`

    const tpl = passwordResetEmail({ resetUrl, userName: user.name })
    await sendEmail({
      to: user.email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
    })

    return apiSuccess(GENERIC_OK)
  } catch (err) {
    console.error("[forgot-password] error:", err)
    return apiSuccess(GENERIC_OK)
  }
}
