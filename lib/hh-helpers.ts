// ─── HH Token Helper ────────────────────────────────────────────────────────
// Get a valid access token for a company, auto-refreshing if expired.

import { db } from "@/lib/db"
import { hhIntegrations } from "@/lib/db/schema"
import { eq, sql } from "drizzle-orm"
import { refreshAccessToken } from "@/lib/hh-api"

export async function getValidToken(companyId: string): Promise<{ accessToken: string; integration: typeof hhIntegrations.$inferSelect } | null> {
  const [integration] = await db
    .select()
    .from(hhIntegrations)
    .where(eq(hhIntegrations.companyId, companyId))
    .limit(1)

  if (!integration || !integration.isActive) return null

  // Check if token is still valid (with 5 min buffer)
  const now = new Date()
  const expiresAt = new Date(integration.tokenExpiresAt)
  const bufferMs = 5 * 60 * 1000

  if (expiresAt.getTime() - bufferMs > now.getTime()) {
    return { accessToken: integration.accessToken, integration }
  }

  // Token expired — refresh.
  // Рефреш сериализуем per-integration через advisory xact lock: hh ротирует
  // refresh_token при первом использовании, и два параллельных крона
  // (hh-import + follow-up) с одним refresh_token получали invalid_grant
  // → ложная деактивация интеграции. Под локом перечитываем токен: если его
  // уже обновил другой поток — просто отдаём свежий, без похода в hh.
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${integration.id}))`)

      const [fresh] = await tx
        .select()
        .from(hhIntegrations)
        .where(eq(hhIntegrations.id, integration.id))
        .limit(1)
      if (!fresh || !fresh.isActive) return null
      if (new Date(fresh.tokenExpiresAt).getTime() - bufferMs > Date.now()) {
        return { accessToken: fresh.accessToken, integration: fresh }
      }

      const tokens = await refreshAccessToken(fresh.refreshToken)
      const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000)

      const [updated] = await tx
        .update(hhIntegrations)
        .set({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          tokenExpiresAt: newExpiresAt,
          updatedAt: new Date(),
        })
        .where(eq(hhIntegrations.id, integration.id))
        .returning()

      return { accessToken: tokens.access_token, integration: updated }
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[hh-helpers] Token refresh failed:", msg)
    // ВАЖНО (правило владельца: «крон не должен сам деактивировать интеграцию»):
    // деактивируем ТОЛЬКО если hh явно отверг refresh_token (400 invalid_grant)
    // — тогда нужна ручная переподключка. Все прочие сбои (5xx, сеть, таймаут,
    // 429) — ВРЕМЕННЫЕ: возвращаем null, но интеграцию НЕ трогаем, чтобы cron
    // повторил рефреш на следующем тике. Раньше любой сбой ставил isActive=false
    // → интеграция «умирала» навсегда (cron её больше не брал), и автоимпорт
    // компании вставал до ручного переподключения.
    const isInvalidGrant = /\b400\b/.test(msg) && /invalid_grant/i.test(msg)
    if (isInvalidGrant) {
      // ГОНКА РЕФРЕША: hh ротирует refresh_token — после первого использования
      // старый становится невалидным. Если cron обрабатывает компании
      // параллельно (Promise.all) и два потока почти одновременно дёрнули
      // рефреш одним и тем же refresh_token — ПЕРВЫЙ успешно обновит токен
      // (новый срок в БД), ВТОРОЙ получит invalid_grant на уже отозванном
      // токене. Это НЕ повод деактивировать: токен в БД уже свежий.
      // Перечитываем интеграцию: если её токен обновился (срок ушёл в будущее
      // или accessToken сменился) — это гонка, отдаём свежий токен.
      const [fresh] = await db
        .select()
        .from(hhIntegrations)
        .where(eq(hhIntegrations.id, integration.id))
        .limit(1)
      if (fresh && fresh.isActive) {
        const freshExpires = new Date(fresh.tokenExpiresAt).getTime()
        const refreshedByOther =
          freshExpires - bufferMs > Date.now() || fresh.accessToken !== integration.accessToken
        if (refreshedByOther) {
          console.warn(`[hh-helpers] integration ${integration.id}: invalid_grant из-за гонки рефреша, токен уже обновлён другим потоком — НЕ деактивируем`)
          return { accessToken: fresh.accessToken, integration: fresh }
        }
      }
      // Реально мёртвый refresh_token — нужна ручная переподключка.
      await db
        .update(hhIntegrations)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(hhIntegrations.id, integration.id))
      console.warn(`[hh-helpers] integration ${integration.id} деактивирована: refresh_token отвергнут hh (нужна переподключка)`)
    }
    return null
  }
}
