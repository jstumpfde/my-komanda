import { db } from "@/lib/db"
import { auditLog } from "@/lib/db/schema"

// ФЗ-152: запись события аудита операций с персональными данными.
// НЕ блокирующая и НЕ бросающая — аудит не должен ронять основную операцию.
// Если запись не удалась, только пишем warning в лог.

export type AuditAction =
  | "candidate_export"
  | "candidate_delete"
  | "candidate_view_contacts"
  | "candidate_bulk_update"

export interface AuditEntry {
  tenantId?: string | null
  userId?: string | null
  userEmail?: string | null
  action: AuditAction | string
  entityType?: string | null
  entityId?: string | null
  count?: number | null
  meta?: Record<string, unknown>
  ip?: string | null
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    await db.insert(auditLog).values({
      tenantId:   entry.tenantId ?? null,
      userId:     entry.userId ?? null,
      userEmail:  entry.userEmail ?? null,
      action:     entry.action,
      entityType: entry.entityType ?? null,
      entityId:   entry.entityId ?? null,
      count:      entry.count ?? null,
      meta:       entry.meta ?? {},
      ip:         entry.ip ?? null,
    })
  } catch (err) {
    console.warn("[audit] не удалось записать событие:", err instanceof Error ? err.message : err)
  }
}

// Достаёт IP из заголовков запроса (за nginx/прокси).
export function ipFromRequest(req: Request): string | null {
  const h = req.headers
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    null
  )
}
