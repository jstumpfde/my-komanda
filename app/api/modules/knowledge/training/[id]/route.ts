import { NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { trainingScenarios } from "@/lib/db/schema"
import { apiError, apiSuccess, requireCompany } from "@/lib/api-helpers"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const [scenario] = await db
      .select()
      .from(trainingScenarios)
      .where(and(eq(trainingScenarios.id, id), eq(trainingScenarios.tenantId, user.companyId)))
      .limit(1)

    if (!scenario) return apiError("Not found", 404)
    return apiSuccess(scenario)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
