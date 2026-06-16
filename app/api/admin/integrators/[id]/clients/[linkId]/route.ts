// DELETE — отвязать клиента от партнёра (зеркало партнёрской отвязки):
// integrator_clients.status = 'cancelled'. Строку не удаляем (мягко).
import { NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { integratorClients } from "@/lib/db/schema"
import { apiError, apiSuccess } from "@/lib/api-helpers"
import { requireAdminPanelAccess } from "@/lib/platform/auth"

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; linkId: string }> }
) {
  try {
    await requireAdminPanelAccess()
  } catch (e) {
    return e as Response
  }

  const { id, linkId } = await params

  const [updated] = await db
    .update(integratorClients)
    .set({ status: "cancelled" })
    .where(and(
      eq(integratorClients.id, linkId),
      eq(integratorClients.integratorId, id),
    ))
    .returning({ id: integratorClients.id })

  if (!updated) return apiError("Связь не найдена", 404)

  return apiSuccess({ ok: true })
}
