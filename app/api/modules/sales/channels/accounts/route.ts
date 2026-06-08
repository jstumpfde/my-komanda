import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { salesChannelAccounts } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

const ALLOWED_CHANNELS = ["telegram", "email", "widget", "whatsapp", "max", "messenger"] as const
type Channel = typeof ALLOWED_CHANNELS[number]

function isAllowedChannel(val: unknown): val is Channel {
  return typeof val === "string" && (ALLOWED_CHANNELS as readonly string[]).includes(val)
}

/**
 * Маскирует секреты: вместо botToken и webhookSecret отдаёт булевы флаги.
 */
function sanitizeAccount(row: typeof salesChannelAccounts.$inferSelect) {
  const { botToken, webhookSecret, ...rest } = row
  return {
    ...rest,
    hasToken: botToken != null && botToken.length > 0,
    hasWebhookSecret: webhookSecret != null && webhookSecret.length > 0,
  }
}

// GET /api/modules/sales/channels/accounts
// Список аккаунтов каналов текущего тенанта (без секретов).
export async function GET(_req: NextRequest) {
  try {
    const user = await requireCompany()

    const rows = await db
      .select()
      .from(salesChannelAccounts)
      .where(eq(salesChannelAccounts.tenantId, user.companyId))
      .orderBy(salesChannelAccounts.createdAt)

    return apiSuccess({ accounts: rows.map(sanitizeAccount) })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Внутренняя ошибка сервера", 500)
  }
}

// POST /api/modules/sales/channels/accounts
// Создать аккаунт канала.
// Body: { channel, title?, botToken?, fromAddress?, externalAccountId?, isActive? }
export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = await req.json()

    if (!isAllowedChannel(body.channel)) {
      return apiError(
        `Поле 'channel' обязательно и должно быть одним из: ${ALLOWED_CHANNELS.join(", ")}`,
        400,
      )
    }

    // Для Telegram-аккаунта генерируем webhookSecret автоматически.
    const webhookSecret =
      body.channel === "telegram" ? crypto.randomUUID() : (body.webhook_secret ?? null)

    const [account] = await db
      .insert(salesChannelAccounts)
      .values({
        tenantId: user.companyId,
        channel: body.channel,
        title: body.title?.trim() || null,
        isActive: body.is_active ?? true,
        botToken: body.bot_token || null,
        fromAddress: body.from_address || null,
        externalAccountId: body.external_account_id || null,
        webhookSecret,
        config: body.config ?? null,
      })
      .returning()

    return apiSuccess(sanitizeAccount(account), 201)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Внутренняя ошибка сервера", 500)
  }
}

// PATCH /api/modules/sales/channels/accounts
// Обновить аккаунт канала.
// Body: { id, title?, isActive?, botToken?, fromAddress?, externalAccountId? }
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = await req.json()

    if (!body.id) return apiError("Поле 'id' обязательно", 400)

    const [updated] = await db
      .update(salesChannelAccounts)
      .set({
        ...(body.title !== undefined && { title: body.title?.trim() ?? null }),
        ...(body.is_active !== undefined && { isActive: body.is_active }),
        ...(body.bot_token !== undefined && { botToken: body.bot_token || null }),
        ...(body.from_address !== undefined && { fromAddress: body.from_address || null }),
        ...(body.external_account_id !== undefined && {
          externalAccountId: body.external_account_id || null,
        }),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(salesChannelAccounts.id, body.id),
          eq(salesChannelAccounts.tenantId, user.companyId),
        ),
      )
      .returning()

    if (!updated) return apiError("Аккаунт не найден", 404)
    return apiSuccess(sanitizeAccount(updated))
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Внутренняя ошибка сервера", 500)
  }
}

// DELETE /api/modules/sales/channels/accounts
// Удалить аккаунт канала.
// Body: { id }
export async function DELETE(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = await req.json()

    if (!body.id) return apiError("Поле 'id' обязательно", 400)

    const [deleted] = await db
      .delete(salesChannelAccounts)
      .where(
        and(
          eq(salesChannelAccounts.id, body.id),
          eq(salesChannelAccounts.tenantId, user.companyId),
        ),
      )
      .returning()

    if (!deleted) return apiError("Аккаунт не найден", 404)
    return apiSuccess({ id: deleted.id, удалён: true })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
