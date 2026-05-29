import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancyIntakes } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { intakeToScoringSpec, type IntakeData } from "@/lib/scoring/intake-to-spec"

// POST /api/modules/hr/intakes/[id]/scoring-spec
// Превращает заявку клиента в спецификацию отбора (ScoringSpec) через AI.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const [intake] = await db
      .select()
      .from(vacancyIntakes)
      .where(and(eq(vacancyIntakes.id, id), eq(vacancyIntakes.tenantId, user.companyId)))
      .limit(1)

    if (!intake) return apiError("Заявка не найдена", 404)

    const spec = await intakeToScoringSpec((intake.data ?? {}) as IntakeData)
    return apiSuccess({ spec })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError(err instanceof Error ? err.message : "Ошибка генерации спецификации", 500)
  }
}
