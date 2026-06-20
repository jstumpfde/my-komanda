/**
 * POST /api/modules/hr/vacancies/[id]/portrait-adopt
 *
 * Перевод СУЩЕСТВУЮЩЕЙ вакансии на контур «Портрет»:
 *  - если Spec ещё нет — собираем из текущих legacy-полей (buildSpecFromLegacy)
 *    и сохраняем (ничего не теряется: критерии/пороги переносятся как есть);
 *  - ставим vacancies.portrait_scoring = true.
 * После этого оценка резюме идёт ТОЛЬКО из «Портрета» (vacancy_specs).
 * Идемпотентно. Существующий непустой Spec НЕ перезаписываем.
 */

import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { buildSpecFromLegacy } from "@/lib/core/spec/from-legacy"
import { getSpec, saveSpec } from "@/lib/core/spec/store"

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const [vac] = await db
      .select({
        id:                vacancies.id,
        companyId:         vacancies.companyId,
        requirementsJson:  vacancies.requirementsJson,
        aiProcessSettings: vacancies.aiProcessSettings,
        stopFactorsJson:   vacancies.stopFactorsJson,
        descriptionJson:   vacancies.descriptionJson,
        portraitScoring:   vacancies.portraitScoring,
      })
      .from(vacancies)
      .where(eq(vacancies.id, id))
      .limit(1)

    if (!vac || vac.companyId !== user.companyId) return apiError("Вакансия не найдена", 404)

    // Spec создаём только если его ещё нет — не затираем уже настроенный «Портрет».
    const existing = await getSpec(id)
    let specCreated = false
    if (!existing) {
      const spec = buildSpecFromLegacy({
        requirementsJson:  vac.requirementsJson,
        aiProcessSettings: vac.aiProcessSettings as Record<string, unknown> | null,
        stopFactorsJson:   vac.stopFactorsJson,
        descriptionJson:   vac.descriptionJson as Record<string, unknown> | null,
      })
      await saveSpec(id, spec, user.id)
      specCreated = true
    }

    await db
      .update(vacancies)
      .set({ portraitScoring: true })
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))

    return apiSuccess({ portraitScoring: true, specCreated })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[portrait-adopt]", err)
    return apiError("Не удалось перевести вакансию на «Портрет»", 500)
  }
}
