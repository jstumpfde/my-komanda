// Запуск AI-оптимизатора вручную (кнопка «Запустить анализ»).
// GET — последние действия/рекомендации агента.

import { apiError, apiSuccess, requireCompany } from "@/lib/api-helpers"
import { listRecentActions, runOptimizer } from "@/lib/yandex-direct/agent"

export async function GET() {
  try {
    const user = await requireCompany()
    const actions = await listRecentActions(user.companyId, 100)
    return apiSuccess({ actions })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

export async function POST() {
  try {
    const user = await requireCompany()
    const result = await runOptimizer(user.companyId)
    return apiSuccess(result)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[yandex-direct/agent]", err)
    return apiError(err instanceof Error ? err.message : "Ошибка анализа", 500)
  }
}
