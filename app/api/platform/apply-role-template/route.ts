// POST /api/platform/apply-role-template
//
// Платформенное применение шаблона роли к вакансии БЕЗ сессии (server-side / curl).
// Нужно для активации полигонов (напр. засеять движок воронки-v2 на тест-вакансии),
// когда у оператора нет интерактивной сессии нужной компании.
//
// Защита: заголовок X-Platform-Admin-Key (env PLATFORM_ADMIN_KEY) — как остальные
// /api/platform/* эндпоинты. companyId передаётся явно (нет сессии → нет тенанта).
//
// Body: { vacancyId, companyId, roleTemplateId, productProfileId?, overwrite? }
// Возвращает: { ok, demoId } | { error, reason }

import { NextRequest, NextResponse } from "next/server"
import { requirePlatformKey } from "@/lib/platform/auth"
import { applyRoleTemplateToVacancy } from "@/lib/hiring/role-templates/apply"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const denied = requirePlatformKey(req)
  if (denied) return denied

  const body = (await req.json().catch(() => ({}))) as {
    vacancyId?: string
    companyId?: string
    roleTemplateId?: string
    productProfileId?: string
    overwrite?: boolean
  }

  if (!body.vacancyId || !body.companyId || !body.roleTemplateId) {
    return NextResponse.json(
      { error: "vacancyId, companyId и roleTemplateId обязательны" },
      { status: 400 },
    )
  }

  try {
    const result = await applyRoleTemplateToVacancy({
      vacancyId: body.vacancyId,
      companyId: body.companyId,
      roleTemplateId: body.roleTemplateId,
      productProfileId: body.productProfileId,
      // userId опускаем: нет сессии. applyRoleTemplateToVacancy это допускает.
      overwrite: !!body.overwrite,
    })

    if (!result.ok) {
      const status = result.reason === "needs_confirm" ? 409 : result.reason === "not_found" ? 404 : 422
      const msg = {
        needs_confirm: "В вакансии уже есть контент — передайте overwrite:true для перезаписи",
        no_products: "У компании нет профиля продукта — заполните в настройках найма",
        no_profile: "Не найден профиль продукта",
        not_found: "Вакансия или шаблон не найдены (проверьте companyId)",
      }[result.reason]
      return NextResponse.json({ error: msg, reason: result.reason }, { status })
    }

    return NextResponse.json({ ok: true, demoId: result.demoId })
  } catch (err) {
    console.error("[platform/apply-role-template]", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
