// AI-генерация черновика кампании из брифа. Черновик возвращается в UI
// на редактирование, в БД не пишется (публикация — отдельный POST /publish).

import { NextRequest } from "next/server"
import { apiError, apiSuccess, requireCompany } from "@/lib/api-helpers"
import { generateCampaignDraft, type CampaignBrief } from "@/lib/yandex-direct/generate-campaign"

export async function POST(req: NextRequest) {
  try {
    await requireCompany()
    const body = await req.json()

    const brief: CampaignBrief = {
      product: String(body.product ?? "").trim(),
      landingUrl: String(body.landingUrl ?? "").trim(),
      geo: String(body.geo ?? "").trim() || "вся Россия",
      weeklyBudgetRub: Number(body.weeklyBudgetRub) || 0,
      goal: body.goal ? String(body.goal) : undefined,
      audience: body.audience ? String(body.audience) : undefined,
      advantages: body.advantages ? String(body.advantages) : undefined,
    }
    if (!brief.product) return apiError("Опишите продукт или услугу", 400)
    if (!brief.landingUrl || !/^https?:\/\//.test(brief.landingUrl)) {
      return apiError("Укажите посадочную страницу (https://…)", 400)
    }
    if (brief.weeklyBudgetRub < 300) return apiError("Недельный бюджет — минимум 300 ₽", 400)

    const draft = await generateCampaignDraft(brief)
    return apiSuccess({ draft })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[yandex-direct/generate]", err)
    return apiError("Не удалось сгенерировать кампанию, попробуйте ещё раз", 500)
  }
}
