// API для контактных данных юр.документов (/settings/legal).
// GET  — возвращает legalContactJson + fallback-поля из companies.* (для предзаполнения).
// PUT  — сохраняет legalContactJson (только директор).

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { companies, type CompanyLegalContact } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { requireCompany, requireDirector, apiError, apiSuccess } from "@/lib/api-helpers"

export async function GET() {
  try {
    const user = await requireCompany()
    const [company] = await db
      .select({
        legalContactJson: companies.legalContactJson,
        name:             companies.name,
        fullName:         companies.fullName,
        email:            companies.email,
        phone:            companies.phone,
        legalAddress:     companies.legalAddress,
      })
      .from(companies)
      .where(eq(companies.id, user.companyId))
      .limit(1)

    if (!company) return apiError("Company not found", 404)

    // Fallback-значения из основных реквизитов компании (если legalContactJson пуст).
    const fallback: CompanyLegalContact = {
      companyName:  company.fullName || company.name || undefined,
      email:        company.email    || undefined,
      phone:        company.phone    || undefined,
      legalAddress: company.legalAddress || undefined,
    }

    return apiSuccess({
      legalContact: (company.legalContactJson ?? {}) as CompanyLegalContact,
      fallback,
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[GET /api/companies/legal-contact]", err)
    return apiError("Не удалось загрузить контактные данные", 500)
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireDirector()
    const body = (await req.json().catch(() => ({}))) as CompanyLegalContact

    // Принимаем только известные поля, игнорируем остальное.
    const data: CompanyLegalContact = {
      companyName:  typeof body.companyName  === "string" ? body.companyName  : undefined,
      email:        typeof body.email        === "string" ? body.email        : undefined,
      phone:        typeof body.phone        === "string" ? body.phone        : undefined,
      legalAddress: typeof body.legalAddress === "string" ? body.legalAddress : undefined,
      responsible:  typeof body.responsible  === "string" ? body.responsible  : undefined,
    }

    await db
      .update(companies)
      .set({ legalContactJson: data, updatedAt: new Date() })
      .where(eq(companies.id, user.companyId))

    return apiSuccess({ legalContact: data })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[PUT /api/companies/legal-contact]", err)
    return apiError("Не удалось сохранить контактные данные", 500)
  }
}
