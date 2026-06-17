import { NextRequest } from "next/server"
import { desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { promoCodes } from "@/lib/db/schema"
import { requirePlatformAdmin, apiError, apiSuccess } from "@/lib/api-helpers"

const VALID_KINDS = ["discount_percent", "trial_days", "plan"] as const
type PromoKind = typeof VALID_KINDS[number]

// GET /api/admin/promo-codes — список промокодов (свежие сверху)
export async function GET(_req: NextRequest) {
  try {
    await requirePlatformAdmin()

    const rows = await db
      .select()
      .from(promoCodes)
      .orderBy(desc(promoCodes.createdAt))

    return apiSuccess({ promoCodes: rows })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[admin/promo-codes GET]", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}

// POST /api/admin/promo-codes — создать промокод
export async function POST(req: NextRequest) {
  try {
    await requirePlatformAdmin()

    const body = await req.json().catch(() => ({}))
    const rawCode: string  = body.code     ?? ""
    const kind: string     = body.kind     ?? ""
    const value: string    = body.value    ?? ""
    const maxUses: number  = typeof body.maxUses === "number" ? Math.max(0, Math.floor(body.maxUses)) : 0
    const expiresAt: string | null = body.expiresAt ?? null

    // Валидация
    const code = rawCode.toUpperCase().trim()
    if (!code) return apiError("Введите промокод", 400)
    if (!/^[A-Z0-9_-]{2,32}$/.test(code)) {
      return apiError("Промокод: только латинские буквы, цифры, дефис и нижнее подчёркивание (2-32 символа)", 400)
    }
    if (!(VALID_KINDS as readonly string[]).includes(kind)) {
      return apiError("Некорректный тип промокода", 400)
    }
    if (!value.trim()) return apiError("Укажите значение промокода", 400)

    // Уникальность code
    const existing = await db
      .select({ id: promoCodes.id })
      .from(promoCodes)
      .where(eq(promoCodes.code, code))
      .limit(1)
    if (existing.length) return apiError("Промокод с таким кодом уже существует", 409)

    const [created] = await db
      .insert(promoCodes)
      .values({
        code,
        kind:      kind as PromoKind,
        value:     value.trim(),
        maxUses,
        usedCount: 0,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        isActive:  true,
      })
      .returning()

    return apiSuccess({ promoCode: created }, 201)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[admin/promo-codes POST]", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
