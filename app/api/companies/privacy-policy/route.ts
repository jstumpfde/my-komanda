// API для редактирования политики конфиденциальности текущей компании.
// GET   — отдаёт сохранённый HTML и updatedAt (или null, если не задан).
// PUT   — сохраняет HTML, обновляет privacyPolicyUpdatedAt.
// POST  — генерирует дефолтный шаблон по реквизитам компании (НЕ сохраняет).

import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { generateDefaultPrivacyPolicy } from "@/lib/legal/default-privacy-policy"

async function loadCompany(companyId: string) {
  const [c] = await db
    .select({
      id:                     companies.id,
      name:                   companies.name,
      inn:                    companies.inn,
      legalAddress:           companies.legalAddress,
      email:                  companies.email,
      subdomain:              companies.subdomain,
      privacyPolicyHtml:      companies.privacyPolicyHtml,
      privacyPolicyUpdatedAt: companies.privacyPolicyUpdatedAt,
    })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1)
  return c ?? null
}

export async function GET() {
  try {
    const user = await requireCompany()
    const company = await loadCompany(user.companyId)
    if (!company) return apiError("Company not found", 404)

    return apiSuccess({
      html:      company.privacyPolicyHtml,
      updatedAt: company.privacyPolicyUpdatedAt,
      subdomain: company.subdomain,
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[privacy-policy GET]", err)
    return apiError("Internal server error", 500)
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = await req.json().catch(() => ({})) as { html?: unknown }
    const html = typeof body.html === "string" ? body.html : ""

    if (!html.trim()) {
      return apiError("html is required", 400)
    }

    const updatedAt = new Date()
    await db.update(companies)
      .set({ privacyPolicyHtml: html, privacyPolicyUpdatedAt: updatedAt })
      .where(eq(companies.id, user.companyId))

    return apiSuccess({ html, updatedAt })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[privacy-policy PUT]", err)
    return apiError("Internal server error", 500)
  }
}

export async function POST() {
  try {
    const user = await requireCompany()
    const company = await loadCompany(user.companyId)
    if (!company) return apiError("Company not found", 404)

    if (!company.inn || !company.email) {
      return apiError("Заполните ИНН и контактный email компании в настройках перед генерацией шаблона", 400)
    }

    const html = generateDefaultPrivacyPolicy({
      name:         company.name,
      inn:          company.inn,
      legalAddress: company.legalAddress,
      email:        company.email,
    })

    return apiSuccess({ html })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[privacy-policy POST]", err)
    return apiError("Internal server error", 500)
  }
}
