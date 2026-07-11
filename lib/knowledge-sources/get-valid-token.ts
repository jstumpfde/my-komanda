// Возвращает живой (расшифрованный) access_token источника Яндекс.Диска —
// рефрешит, только если истекает в ближайшие 5 минут (паттерн
// lib/zoom/get-valid-token.ts, см. memory hh-no-early-token-refresh: рефрешим
// только истёкшие/близкие, не «на всякий случай»).

import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { knowledgeSources } from "@/lib/db/schema"
import { decryptToken, encryptToken } from "./token-crypto"
import { refreshTokens } from "./yandex-oauth"

export async function getValidYandexDiskToken(sourceId: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(knowledgeSources)
    .where(eq(knowledgeSources.id, sourceId))
    .limit(1)

  if (!row || row.provider !== "yandex_disk") return null

  let currentAccess: string
  try {
    currentAccess = decryptToken(row.accessTokenEnc)
  } catch (err) {
    console.error("[knowledge-sources] failed to decrypt access token", err)
    return null
  }

  const expiresSoon = row.tokenExpiresAt
    ? row.tokenExpiresAt.getTime() - Date.now() < 5 * 60 * 1000
    : true
  if (!expiresSoon) return currentAccess
  if (!row.refreshTokenEnc) return currentAccess // нечем обновить — пробуем текущий

  try {
    const refreshToken = decryptToken(row.refreshTokenEnc)
    const tokens = await refreshTokens(refreshToken)
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000)
    await db
      .update(knowledgeSources)
      .set({
        accessTokenEnc: encryptToken(tokens.access_token),
        refreshTokenEnc: tokens.refresh_token ? encryptToken(tokens.refresh_token) : row.refreshTokenEnc,
        tokenExpiresAt: expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(knowledgeSources.id, sourceId))
    return tokens.access_token
  } catch (err) {
    console.error("[knowledge-sources] yandex-disk token refresh failed", err)
    return currentAccess
  }
}
