import { NextRequest } from "next/server"
import { and, eq, gt, isNull, or, sql } from "drizzle-orm"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { inviteLinks, users } from "@/lib/db/schema"
import { apiError, apiSuccess } from "@/lib/api-helpers"
import { checkRateLimit } from "@/lib/rate-limit"
import { PRIVACY_POLICY_VERSION } from "@/lib/legal/operator-requisites"
import { insertConsentLog } from "@/lib/legal/log-consent"
import { triggerOnboarding } from "@/lib/knowledge/onboarding"

// POST /api/invites/register — регистрация нового пользователя ПО инвайт-ссылке.
//
// Общая self-serve регистрация закрыта (app/api/auth/register всегда 403,
// компании подключаются вручную — коммит 5b0a2136). Приглашённый сотрудник —
// осознанное исключение из этой политики: компания уже существует, а директор
// «одобрил» человека самим фактом выдачи токен-ссылки с ролью. Поэтому здесь
// аккаунт создаётся и сразу вступает в компанию из ссылки одним атомарным
// шагом — токен валидируется по тем же правилам, что и /api/invites/accept.
// Роль и компания берутся ТОЛЬКО из ссылки, клиент их не передаёт.

// Та же парольная политика, что при сбросе пароля (app/api/auth/reset-password).
function isValidPassword(password: string): boolean {
  if (password.length < 8) return false
  if (!/[A-Za-zА-Яа-яЁё]/.test(password)) return false
  if (!/[0-9]/.test(password)) return false
  return true
}

// drizzle заворачивает driver-ошибку: code лежит на .cause (см. lib/tip/service.ts)
function isUniqueViolation(e: unknown): boolean {
  const code = (e as { code?: string })?.code ?? (e as { cause?: { code?: string } })?.cause?.code
  return code === "23505"
}

// Сентинел: лимит использований ссылки выбрали между SELECT и UPDATE
class InviteExhaustedError extends Error {}

export async function POST(req: NextRequest) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown"
    if (!checkRateLimit(`invite-register:${ip}`, 10, 15 * 60 * 1000)) {
      return apiError("Слишком много попыток. Попробуйте через 15 минут.", 429)
    }

    const body = await req.json().catch(() => ({})) as {
      token?: unknown
      name?: unknown
      email?: unknown
      password?: unknown
    }

    const token = typeof body.token === "string" ? body.token : ""
    const name = (typeof body.name === "string" ? body.name : "").trim()
    const email = (typeof body.email === "string" ? body.email : "").trim().toLowerCase()
    const password = typeof body.password === "string" ? body.password : ""

    if (!token) return apiError("token required", 400)
    if (!name || !email || !password) return apiError("Все поля обязательны", 400)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return apiError("Некорректный формат email", 400)
    }
    if (!isValidPassword(password)) {
      return apiError("Пароль должен содержать минимум 8 символов, хотя бы 1 букву и 1 цифру", 400)
    }

    // Активная, не истёкшая ссылка — критерии идентичны /api/invites/accept
    const [link] = await db
      .select()
      .from(inviteLinks)
      .where(
        and(
          eq(inviteLinks.token, token),
          eq(inviteLinks.isActive, true),
          or(isNull(inviteLinks.expiresAt), gt(inviteLinks.expiresAt, new Date())),
        )
      )
      .limit(1)

    if (!link) {
      return apiError("Ссылка недействительна или истекла", 404)
    }
    if (link.maxUses !== null && (link.usesCount ?? 0) >= link.maxUses) {
      return apiError("Лимит использований исчерпан", 410)
    }

    // Дружелюбная проверка занятости email (гонку добивает unique-констрейнт ниже)
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1)
    if (existing) {
      return apiError("Аккаунт с таким email уже есть — войдите и примите приглашение", 409)
    }

    const passwordHash = await bcrypt.hash(password, 10)

    // Транзакция: занять использование ссылки + создать пользователя.
    // Guarded UPDATE (isActive + запас использований прямо в WHERE) закрывает
    // гонку двух регистраций по одной одноразовой ссылке; откат транзакции
    // (например, 23505 по email) возвращает использование обратно.
    const userId = await db.transaction(async (tx) => {
      const claimed = await tx
        .update(inviteLinks)
        .set({ usesCount: sql`${inviteLinks.usesCount} + 1` })
        .where(
          and(
            eq(inviteLinks.id, link.id),
            eq(inviteLinks.isActive, true),
            or(isNull(inviteLinks.maxUses), sql`${inviteLinks.usesCount} < ${inviteLinks.maxUses}`),
          )
        )
        .returning({ usesCount: inviteLinks.usesCount, maxUses: inviteLinks.maxUses })

      if (!claimed.length) throw new InviteExhaustedError()

      const { usesCount, maxUses } = claimed[0]
      if (maxUses !== null && (usesCount ?? 0) >= maxUses) {
        await tx
          .update(inviteLinks)
          .set({ isActive: false })
          .where(eq(inviteLinks.id, link.id))
      }

      const [user] = await tx
        .insert(users)
        .values({
          email,
          name,
          passwordHash,
          role: link.role,
          companyId: link.companyId,
          isActive: true,
        })
        .returning({ id: users.id })

      return user.id
    })

    // 152-ФЗ: обязательный чекбокс согласия на форме (кнопка задизейблена без
    // него), поэтому дошедший сабмит = согласие дано. Пишем здесь же, на сервере.
    try {
      await insertConsentLog({
        req,
        userId,
        visitorId: email,
        consentType: "privacy_policy",
        documentVersion: PRIVACY_POLICY_VERSION,
      })
    } catch (err) {
      console.error("[invites/register] consent log failed:", err)
    }

    // Паритет с /api/invites/accept: автоподбор плана обучения + приветствие
    try {
      await triggerOnboarding(link.companyId, userId)
    } catch (err) {
      console.error("[invites/register] onboarding trigger failed:", err)
    }

    return apiSuccess({ ok: true, userId, companyId: link.companyId, role: link.role }, 201)
  } catch (err) {
    if (err instanceof InviteExhaustedError) {
      return apiError("Лимит использований исчерпан", 410)
    }
    if (isUniqueViolation(err)) {
      return apiError("Аккаунт с таким email уже есть — войдите и примите приглашение", 409)
    }
    console.error("[invites/register] error:", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
