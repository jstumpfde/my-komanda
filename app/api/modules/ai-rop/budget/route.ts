// GET /api/modules/ai-rop/budget — текущие лимиты + накопленный расход за
// текущий календарный месяц (UTC).
// POST { maxAnthropicTokens?, maxOpenaiSeconds?, maxOpenaiChatTokens?,
//        maxYandexSttSeconds?, action? } — обновить лимиты.
// Доступ: requireRopManage (директор).
import { NextResponse } from "next/server"
import { apiError } from "@/lib/api-helpers"
import { requireRopManage } from "@/lib/ai-rop/access"
import { getCompanyBudget, setCompanyBudget, getMonthlyUsage, type BudgetAction } from "@/lib/ai-rop/budget"

export async function GET() {
  try {
    const user = await requireRopManage()
    const [budget, usage] = await Promise.all([getCompanyBudget(user.companyId), getMonthlyUsage(user.companyId)])
    return NextResponse.json({ ok: true, budget, usage })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/budget] GET error:", err)
    return apiError("Internal server error", 500)
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRopManage()
    const body = (await req.json().catch(() => ({}))) as {
      maxAnthropicTokens?: number | null
      maxOpenaiSeconds?: number | null
      maxOpenaiChatTokens?: number | null
      maxYandexSttSeconds?: number | null
      action?: BudgetAction
    }
    // Только реально переданные поля — чтобы отсутствующий ключ в body НЕ
    // затирал текущее значение (setCompanyBudget мёржит через object spread,
    // явный undefined в патче стёр бы существующий лимит).
    const patch: Parameters<typeof setCompanyBudget>[1] = {}
    if ("maxAnthropicTokens" in body) patch.maxAnthropicTokens = body.maxAnthropicTokens ?? null
    if ("maxOpenaiSeconds" in body) patch.maxOpenaiSeconds = body.maxOpenaiSeconds ?? null
    if ("maxOpenaiChatTokens" in body) patch.maxOpenaiChatTokens = body.maxOpenaiChatTokens ?? null
    if ("maxYandexSttSeconds" in body) patch.maxYandexSttSeconds = body.maxYandexSttSeconds ?? null
    if (body.action) patch.action = body.action
    await setCompanyBudget(user.companyId, patch)
    const [budget, usage] = await Promise.all([getCompanyBudget(user.companyId), getMonthlyUsage(user.companyId)])
    return NextResponse.json({ ok: true, budget, usage })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/budget] POST error:", err)
    return apiError("Internal server error", 500)
  }
}
