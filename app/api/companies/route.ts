import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies } from "@/lib/db/schema"
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
      })
      .returning()

    return apiSuccess(company, 201)
  } catch (err) {
    if (err instanceof Response) return err
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
    return apiError("Internal server error", 500)
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireAuth()

    if (!user.companyId) {
      return apiError("No company associated with this account", 403)
    }

    const body = await req.json() as {
      name?: string
      inn?: string
      kpp?: string
      legal_address?: string
      city?: string
      industry?: string
      logo_url?: string
      brand_primary_color?: string
      brand_bg_color?: string
      brand_text_color?: string
    }

    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    }

    if (body.name !== undefined) updates.name = body.name
    if (body.inn !== undefined) updates.inn = body.inn
    if (body.kpp !== undefined) updates.kpp = body.kpp
    if (body.legal_address !== undefined) updates.legalAddress = body.legal_address
    if (body.city !== undefined) updates.city = body.city
    if (body.industry !== undefined) updates.industry = body.industry
    if (body.logo_url !== undefined) updates.logoUrl = body.logo_url
    if (body.brand_primary_color !== undefined) updates.brandPrimaryColor = body.brand_primary_color
    if (body.brand_bg_color !== undefined) updates.brandBgColor = body.brand_bg_color
    if (body.brand_text_color !== undefined) updates.brandTextColor = body.brand_text_color

    const [updated] = await db
      .update(companies)
      .set(updates)
      .where(eq(companies.id, user.companyId))
      .returning()

    if (!updated) {
      return apiError("Company not found", 404)
    }

    return apiSuccess(updated)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
