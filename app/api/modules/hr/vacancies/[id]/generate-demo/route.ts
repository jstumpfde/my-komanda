// Онбординг Фаза 2: POST → сгенерировать демонстрацию (уроки демо) из профиля
// компании/продукта для вакансии. НЕ пишет в БД — возвращает уроки, клиент
// создаёт демо-блок в редакторе контента (там же правит = ревью).

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { vacancies, companies, type CompanyHiringDefaults } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { requireCompany } from "@/lib/api-helpers"
import { resolveVacancyProducts } from "@/lib/hiring/role-templates/apply"
import { generateDemoFromProfile, GenerateDemoError } from "@/lib/hiring/bootstrap/generate-demo"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const c = await requireCompany()
    const { id } = await ctx.params
    const body = (await req.json().catch(() => ({}))) as { length?: "short" | "full" }
    const length = body.length === "short" ? "short" : "full"

    const [vac] = await db.select({ title: vacancies.title, descriptionJson: vacancies.descriptionJson })
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, c.companyId)))
      .limit(1)
    if (!vac) return NextResponse.json({ error: "Вакансия не найдена" }, { status: 404 })

    const [company] = await db.select({ desc: companies.companyDescription, hd: companies.hiringDefaultsJson })
      .from(companies).where(eq(companies.id, c.companyId)).limit(1)

    const desc = (vac.descriptionJson ?? {}) as Record<string, unknown>
    const anketa = (desc.anketa ?? {}) as Record<string, unknown>
    const hd = (company?.hd ?? {}) as CompanyHiringDefaults
    const brandCompanyId = typeof anketa.brandCompanyId === "string" ? anketa.brandCompanyId : undefined
    const products = resolveVacancyProducts(hd, brandCompanyId)
    const product = products.find((p) => p.id === hd.defaultProductProfileId) || products[0] || null

    // Описание компании: приоритет — то, что уже в анкете вакансии, иначе из настроек компании.
    const companyDescription = (typeof anketa.companyDescription === "string" && anketa.companyDescription.trim())
      ? anketa.companyDescription
      : (company?.desc ?? "")

    const vacancyTitle = (typeof anketa.vacancyTitle === "string" && anketa.vacancyTitle.trim()) ? anketa.vacancyTitle : (vac.title ?? "")

    const result = await generateDemoFromProfile({ companyDescription, product, vacancyTitle, length })
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    if (err instanceof Response) return err
    if (err instanceof GenerateDemoError) {
      return NextResponse.json({ error: err.message }, { status: 422 })
    }
    console.error("[generate-demo]", err)
    return NextResponse.json({ error: "Ошибка генерации демо" }, { status: 500 })
  }
}
