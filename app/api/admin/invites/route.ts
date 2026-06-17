import { NextRequest } from "next/server"
import { desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { platformInviteLinks, users } from "@/lib/db/schema"
import { requirePlatformAdmin, apiError, apiSuccess } from "@/lib/api-helpers"
import { randomBytes } from "crypto"
import { ALL_ACCESS_TYPES, PARTNER_ACCESS_TYPES } from "@/lib/admin/assign-role"

// GET /api/admin/invites — список ссылок-приглашений (свежие сверху)
export async function GET(_req: NextRequest) {
  try {
    await requirePlatformAdmin()

    const rows = await db
      .select({
        id:        platformInviteLinks.id,
        token:     platformInviteLinks.token,
        role:      platformInviteLinks.role,
        kind:      platformInviteLinks.kind,
        label:     platformInviteLinks.label,
        maxUses:   platformInviteLinks.maxUses,
        usedCount: platformInviteLinks.usedCount,
        expiresAt: platformInviteLinks.expiresAt,
        isActive:  platformInviteLinks.isActive,
        createdAt: platformInviteLinks.createdAt,
        createdBy: platformInviteLinks.createdBy,
        creatorEmail: users.email,
      })
      .from(platformInviteLinks)
      .leftJoin(users, eq(platformInviteLinks.createdBy, users.id))
      .orderBy(desc(platformInviteLinks.createdAt))

    return apiSuccess({ invites: rows })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[admin/invites GET]", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}

// POST /api/admin/invites — создать ссылку-приглашение
export async function POST(req: NextRequest) {
  try {
    const admin = await requirePlatformAdmin()

    const body = await req.json().catch(() => ({}))
    const role: string     = body.role      ?? ""
    const kind: string     = body.kind      ?? ""
    const label: string    = body.label     ?? ""
    const maxUses: number  = typeof body.maxUses === "number" ? Math.max(0, Math.floor(body.maxUses)) : 0
    const expiresAt: string | null = body.expiresAt ?? null

    // Валидация роли
    if (!role || !(ALL_ACCESS_TYPES as string[]).includes(role)) {
      return apiError("Некорректная роль", 400)
    }
    // Партнёрские роли требуют kind
    if ((PARTNER_ACCESS_TYPES as string[]).includes(role) && !kind) {
      return apiError("Для партнёрской роли укажите вид (kind)", 400)
    }

    // Генерируем уникальный token (hex 16 байт = 32 символа)
    let token: string
    let attempts = 0
    do {
      token = randomBytes(16).toString("hex")
      const existing = await db
        .select({ id: platformInviteLinks.id })
        .from(platformInviteLinks)
        .where(eq(platformInviteLinks.token, token))
        .limit(1)
      if (!existing.length) break
      attempts++
    } while (attempts < 5)

    const [created] = await db
      .insert(platformInviteLinks)
      .values({
        token,
        role,
        kind:      kind || null,
        label:     label || null,
        maxUses,
        usedCount: 0,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        isActive:  true,
        createdBy: admin.id ?? null,
      })
      .returning()

    return apiSuccess({ invite: created }, 201)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[admin/invites POST]", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
