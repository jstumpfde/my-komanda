import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies, users } from "@/lib/db/schema"
import { requireAuth, apiError, apiSuccess } from "@/lib/api-helpers"

export async function POST(req: NextRequest) {
  try {
    await requireAuth()

    const body = await req.json() as {
      name: string
      inn?: string
      kpp?: string
      legal_address?: string
      city?: string
      industry?: string
      postal_code?: string
    }

    if (!body.name?.trim()) {
      return apiError("'name' обязателен", 400)
    }

    const [company] = await db
      .insert(companies)
      .values({
        name: body.name.trim(),
        inn: body.inn || null,
        kpp: body.kpp || null,
        legalAddress: body.legal_address || null,
        city: body.city || null,
        industry: body.industry || null,
        postalCode: body.postal_code || null,
      })
      .returning()

    return apiSuccess(company, 201)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[companies POST]", err)
    const msg = err instanceof Error ? err.message : ""
    if (msg.includes("unique")) return apiError("Компания с таким ИНН уже зарегистрирована", 409)
    return apiError("Internal server error", 500)
  }
}

export async function GET() {
  try {
    const user = await requireAuth()

    if (!user.companyId) {
      return apiError("No company associated with this account", 404)
    }

    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, user.companyId))
      .limit(1)

    if (!company) {
      return apiError("Company not found", 404)
    }

    return apiSuccess(company)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[companies GET]", err)
    return apiError("Internal server error", 500)
  }
}

// PATCH delegates to PUT — both support partial updates
export const PATCH = PUT

export async function PUT(req: NextRequest) {
  try {
    const user = await requireAuth()

    const body = await req.json() as {
      name?: string
      inn?: string
      kpp?: string
      legal_address?: string
      city?: string
      industry?: string
      postal_code?: string
      founded_year?: number
      revenue_range?: string
      website?: string
      crm_status?: string
      crm_name?: string
      sales_scripts?: string
      training_system?: string
      trainer?: string
      sales_manager_type?: string
      is_multi_product?: boolean
      logo_url?: string
      brand_primary_color?: string
      brand_bg_color?: string
      brand_text_color?: string
      brand_name?: string
      brand_slogan?: string
      ogrn?: string
      full_name?: string
      director?: string
      description?: string
      company_description?: string
      email?: string
      phone?: string
      employee_count?: number
      registration_date?: string
      office_address?: string
      postal_address?: string
      custom_theme?: Record<string, unknown>
      subdomain?: string
    }

    const fieldMap: Record<string, unknown> = {}
    if (body.name !== undefined) fieldMap.name = body.name
    if (body.inn !== undefined) fieldMap.inn = body.inn
    if (body.kpp !== undefined) fieldMap.kpp = body.kpp
    if (body.legal_address !== undefined) fieldMap.legalAddress = body.legal_address
    if (body.city !== undefined) fieldMap.city = body.city
    if (body.industry !== undefined) fieldMap.industry = body.industry
    if (body.postal_code !== undefined) fieldMap.postalCode = body.postal_code
    if (body.founded_year !== undefined) fieldMap.foundedYear = body.founded_year
    if (body.revenue_range !== undefined) fieldMap.revenueRange = body.revenue_range
    if (body.website !== undefined) fieldMap.website = body.website
    if (body.crm_status !== undefined) fieldMap.crmStatus = body.crm_status
    if (body.crm_name !== undefined) fieldMap.crmName = body.crm_name
    if (body.sales_scripts !== undefined) fieldMap.salesScripts = body.sales_scripts
    if (body.training_system !== undefined) fieldMap.trainingSystem = body.training_system
    if (body.trainer !== undefined) fieldMap.trainer = body.trainer
    if (body.sales_manager_type !== undefined) fieldMap.salesManagerType = body.sales_manager_type
    if (body.is_multi_product !== undefined) fieldMap.isMultiProduct = body.is_multi_product
    // Пустая строка → null (nullable колонки). Клиент отправляет ""
    // для очистки, undefined — чтобы поле не трогалось вообще.
    if (body.logo_url !== undefined) fieldMap.logoUrl = body.logo_url === "" ? null : body.logo_url
    if (body.brand_primary_color !== undefined) fieldMap.brandPrimaryColor = body.brand_primary_color
    if (body.brand_bg_color !== undefined) fieldMap.brandBgColor = body.brand_bg_color
    if (body.brand_text_color !== undefined) fieldMap.brandTextColor = body.brand_text_color
    if (body.brand_name !== undefined) fieldMap.brandName = body.brand_name === "" ? null : body.brand_name
    if (body.brand_slogan !== undefined) fieldMap.brandSlogan = body.brand_slogan === "" ? null : body.brand_slogan
    if (body.ogrn !== undefined) fieldMap.ogrn = body.ogrn
    if (body.full_name !== undefined) fieldMap.fullName = body.full_name
    if (body.director !== undefined) fieldMap.director = body.director
    if (body.description !== undefined) fieldMap.description = body.description
    if (body.company_description !== undefined) fieldMap.companyDescription = body.company_description
    if (body.email !== undefined) fieldMap.email = body.email
    if (body.phone !== undefined) fieldMap.phone = body.phone
    if (body.employee_count !== undefined) fieldMap.employeeCount = body.employee_count
    if (body.registration_date !== undefined) fieldMap.registrationDate = body.registration_date
    if (body.office_address !== undefined) fieldMap.officeAddress = body.office_address
    if (body.postal_address !== undefined) fieldMap.postalAddress = body.postal_address
    if (body.custom_theme !== undefined) fieldMap.customTheme = body.custom_theme
    if (body.subdomain !== undefined) fieldMap.subdomain = body.subdomain

    // Auto-create company if user has no companyId
    if (!user.companyId) {
      const companyName = body.name || body.full_name || "Моя компания"

      const [created] = await db
        .insert(companies)
        .values({
          name: companyName,
          ...fieldMap,
        })
        .returning()

      // Link user to the new company
      await db
        .update(users)
        .set({ companyId: created.id })
        .where(eq(users.id, user.id!))

      return apiSuccess(created, 201)
    }

    const [updated] = await db
      .update(companies)
      .set({ ...fieldMap, updatedAt: new Date() })
      .where(eq(companies.id, user.companyId))
      .returning()

    if (!updated) {
      return apiError("Company not found", 404)
    }

    return apiSuccess(updated)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[companies PUT]", err instanceof Error ? err.message : err, err instanceof Error ? err.stack : "")
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes("subdomain") && msg.includes("unique")) return apiError("Этот поддомен уже занят", 409)
    return apiError("Internal server error", 500)
  }
}
