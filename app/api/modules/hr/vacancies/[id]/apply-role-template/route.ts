// ТЗ №3: применение шаблона роли к вакансии.
// GET  — доступные шаблоны ролей + продукты компании (для диалога выбора).
// POST — применить шаблон (атомарный снимок). 409 needs_confirm, если в вакансии
//        уже есть контент и overwrite не передан.

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { vacancies, companies, type CompanyHiringDefaults } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { requireCompany } from "@/lib/api-helpers"
import { getRoleTemplatesForTenant } from "@/lib/hiring/role-templates/fetch"
import { applyRoleTemplateToVacancy, resolveVacancyProducts } from "@/lib/hiring/role-templates/apply"

export const dynamic = "force-dynamic"

async function loadProducts(companyId: string, vacancyId: string) {
  const [vac] = await db.select({ descriptionJson: vacancies.descriptionJson })
    .from(vacancies).where(and(eq(vacancies.id, vacancyId), eq(vacancies.companyId, companyId))).limit(1)
  const [company] = await db.select({ hd: companies.hiringDefaultsJson })
    .from(companies).where(eq(companies.id, companyId)).limit(1)
  const hd = (company?.hd ?? {}) as CompanyHiringDefaults
  const anketa = ((vac?.descriptionJson as Record<string, unknown> | undefined)?.anketa ?? {}) as Record<string, unknown>
  const brandCompanyId = typeof anketa.brandCompanyId === "string" ? anketa.brandCompanyId : undefined
  const products = resolveVacancyProducts(hd, brandCompanyId)
  const defaultId = brandCompanyId
    ? hd.brandDefaultProductProfileIds?.[brandCompanyId]
    : hd.defaultProductProfileId
  return { products, defaultProductProfileId: defaultId ?? products[0]?.id ?? "" }
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const c = await requireCompany()
    const { id } = await ctx.params
    const [templates, { products, defaultProductProfileId }] = await Promise.all([
      getRoleTemplatesForTenant(c.companyId),
      loadProducts(c.companyId, id),
    ])
    return NextResponse.json({
      templates: templates.map((t) => ({ id: t.id, name: t.name, slug: t.slug, roleCategory: t.roleCategory, isSystem: t.isSystem })),
      products: products.map((p) => ({ id: p.id, name: p.name || "Продукт" })),
      defaultProductProfileId,
    })
  } catch (err) {
    if (err instanceof Response) return err
    throw err
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const c = await requireCompany()
    const { id } = await ctx.params
    const body = (await req.json().catch(() => ({}))) as { roleTemplateId?: string; productProfileId?: string; overwrite?: boolean }
    if (!body.roleTemplateId) {
      return NextResponse.json({ error: "roleTemplateId обязателен" }, { status: 400 })
    }

    const result = await applyRoleTemplateToVacancy({
      vacancyId: id,
      companyId: c.companyId,
      roleTemplateId: body.roleTemplateId,
      productProfileId: body.productProfileId,
      userId: c.id,
      overwrite: !!body.overwrite,
    })

    if (!result.ok) {
      const status = result.reason === "needs_confirm" ? 409 : result.reason === "not_found" ? 404 : 422
      const msg = {
        needs_confirm: "В вакансии уже есть контент — подтвердите перезапись",
        no_products: "Сначала заполните профиль продукта в настройках найма",
        no_profile: "Не найден профиль продукта",
        not_found: "Вакансия или шаблон не найдены",
      }[result.reason]
      return NextResponse.json({ error: msg, reason: result.reason }, { status })
    }

    return NextResponse.json({ ok: true, demoId: result.demoId })
  } catch (err) {
    if (err instanceof Response) return err
    throw err
  }
}
