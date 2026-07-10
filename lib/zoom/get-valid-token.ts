import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { userVideoIntegrations } from "@/lib/db/schema"
import { refreshTokens } from "./oauth"

// Возвращает живой access_token Zoom пользователя (рефрешит, если истекает
// в ближайшие 5 минут — по образцу hh: рефрешим только истёкшие/близкие,
// см. memory hh-no-early-token-refresh). null = Zoom не подключён.
export async function getValidZoomToken(userId: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(userVideoIntegrations)
    .where(and(
      eq(userVideoIntegrations.userId, userId),
      eq(userVideoIntegrations.provider, "zoom"),
      eq(userVideoIntegrations.isActive, true),
    ))
    .limit(1)

  if (!row) return null

  const expiresSoon = row.tokenExpiresAt
    ? row.tokenExpiresAt.getTime() - Date.now() < 5 * 60 * 1000
    : true
  if (!expiresSoon) return row.accessToken

  if (!row.refreshToken) return row.accessToken // нечем обновить — пробуем текущий

  try {
    const tokens = await refreshTokens(row.refreshToken)
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000)
    await db
      .update(userVideoIntegrations)
      .set({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? row.refreshToken,
        tokenExpiresAt: expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(userVideoIntegrations.id, row.id))
    return tokens.access_token
  } catch (err) {
    console.error("[zoom] refresh failed:", err)
    return row.accessToken
  }
}
