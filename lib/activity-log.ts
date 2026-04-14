import { db } from "./db"
import { activityLog } from "./db/schema"

type ActivityAction = "create" | "update" | "delete" | "view" | "export" | "login" | "logout" | "ai_request" | "status_change" | "invite" | "archive"
type EntityType = "vacancy" | "candidate" | "demo" | "course" | "article" | "company" | "user" | "settings" | "template" | "integration"

interface LogActivityParams {
  companyId: string
  userId: string
  action: ActivityAction
  entityType: EntityType
  entityId?: string
  entityTitle?: string
  module?: string
  details?: Record<string, unknown>
  request?: Request | { headers: { get(name: string): string | null } }
}

export async function logActivity(params: LogActivityParams): Promise<void> {
  try {
    const ip = params.request?.headers.get("x-forwarded-for")
      || params.request?.headers.get("x-real-ip")
      || ""
    const userAgent = params.request?.headers.get("user-agent") || ""

    await db.insert(activityLog).values({
      companyId: params.companyId,
      userId: params.userId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId || undefined,
      entityTitle: params.entityTitle || undefined,
      module: params.module || undefined,
      details: params.details || {},
      ipAddress: ip || undefined,
      userAgent: userAgent || undefined,
    })
  } catch (e) {
    console.error("[activity-log] Error:", e)
  }
}
