// Публикация отредактированного черновика в Директ (создание реальных
// кампаний/объявлений/ключей + отправка на модерацию). Тратит деньги
// рекламодателя после модерации — поэтому только директор.

import { NextRequest } from "next/server"
import { apiError, apiSuccess, requireDirector } from "@/lib/api-helpers"
import { publishDraft } from "@/lib/yandex-direct/publish-campaign"
import type { CampaignDraft } from "@/lib/yandex-direct/generate-campaign"

export async function POST(req: NextRequest) {
  try {
    const user = await requireDirector()
    const body = await req.json()

    const draft = body.draft as CampaignDraft | undefined
    const landingUrl = String(body.landingUrl ?? "").trim()
    const weeklyBudgetRub = Number(body.weeklyBudgetRub) || 0
    const regionIds = (Array.isArray(body.regionIds) ? body.regionIds : []).map(Number).filter((n: number) => n > 0)
    const placements = (Array.isArray(body.placements) ? body.placements : []).filter(
      (p: string) => p === "search" || p === "network",
    ) as Array<"search" | "network">

    if (!draft?.campaignName || !draft.keywords?.length) return apiError("Черновик пуст", 400)
    if (!landingUrl || !/^https?:\/\//.test(landingUrl)) return apiError("Укажите посадочную страницу", 400)
    if (!regionIds.length) return apiError("Выберите регион показа", 400)
    if (!placements.length) return apiError("Выберите площадки (поиск / РСЯ)", 400)
    if (weeklyBudgetRub < 300) return apiError("Недельный бюджет — минимум 300 ₽", 400)

    const result = await publishDraft(user.companyId, {
      draft,
      landingUrl,
      regionIds,
      weeklyBudgetRub,
      placements,
    })
    return apiSuccess(result, 201)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[yandex-direct/publish]", err)
    return apiError(err instanceof Error ? err.message : "Не удалось опубликовать кампанию", 500)
  }
}
