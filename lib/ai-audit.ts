import { db } from "@/lib/db"
import { aiAuditLog } from "@/lib/db/schema"

/**
 * Log an AI action to the audit table.
 * Fire-and-forget — errors are silently caught.
 */
export async function logAiAction(params: {
  tenantId: string
  action: string
  vacancyId?: string | null
  candidateId?: string | null
  inputSummary?: string
  outputSummary?: string
}) {
  try {
    await db.insert(aiAuditLog).values({
      tenantId: params.tenantId,
      action: params.action,
      vacancyId: params.vacancyId || null,
      candidateId: params.candidateId || null,
      inputSummary: params.inputSummary?.slice(0, 500) || null,
      outputSummary: params.outputSummary?.slice(0, 500) || null,
    })
  } catch (err) {
    console.error("[ai-audit] log error:", err)
  }
}
