import { db } from "@/lib/db"
import { notifications } from "@/lib/db/schema"

/**
 * Create a notification using the existing notifications table.
 * Fire-and-forget — errors are silently caught.
 */
export async function createNotification(params: {
  tenantId: string
  userId?: string | null
  type: string
  title: string
  body?: string
  severity?: "info" | "warning" | "danger" | "success"
  href?: string
  sourceType?: string
  sourceId?: string
}) {
  try {
    await db.insert(notifications).values({
      tenantId: params.tenantId,
      userId: params.userId || null,
      type: params.type,
      title: params.title,
      body: params.body || null,
      severity: params.severity || "info",
      href: params.href || null,
      sourceType: params.sourceType || null,
      sourceId: params.sourceId || null,
    })
  } catch (err) {
    console.error("[notifications] create error:", err)
  }
}
