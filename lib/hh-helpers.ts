// ─── HH Token Helper ────────────────────────────────────────────────────────
// Get a valid access token for a company, auto-refreshing if expired.

import { db } from "@/lib/db"
import { hhIntegrations } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
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

  // Token expired — refresh
  try {
    const tokens = await refreshAccessToken(integration.refreshToken)
    const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000)

    const [updated] = await db
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
  } catch (err) {
    console.error("[hh-helpers] Token refresh failed:", err)
    // Mark integration as inactive on refresh failure
    await db
      .update(hhIntegrations)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(hhIntegrations.id, integration.id))
    return null
  }
}
