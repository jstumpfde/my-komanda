// API для редактирования политики конфиденциальности текущей компании.
// GET   — отдаёт сохранённый HTML и updatedAt (или null, если не задан).
// PUT   — сохраняет HTML, обновляет privacyPolicyUpdatedAt.
// POST  — генерирует дефолтный шаблон по реквизитам компании (НЕ сохраняет).

import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies } from "@/lib/db/schema"
import { requireCompany, requireDirector, apiError, apiSuccess } from "@/lib/api-helpers"
import { generateDefaultPrivacyPolicy } from "@/lib/legal/default-privacy-policy"

async function loadCompany(companyId: string) {
  const [c] = await db
    .select({
      id:                     companies.id,
      name:                   companies.name,
      fullName:               companies.fullName,
      inn:                    companies.inn,
      legalAddress:           companies.legalAddress,
      email:                  companies.email,
      phone:                  companies.phone,
      subdomain:              companies.subdomain,
      privacyPolicyHtml:      companies.privacyPolicyHtml,
      privacyPolicyUpdatedAt: companies.privacyPolicyUpdatedAt,
      legalContactJson:       companies.legalContactJson,
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
    const user = await requireDirector()
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

    // legalContactJson — приоритет; fallback на основные реквизиты компании.
    const lc = (company.legalContactJson ?? {}) as {
      companyName?: string; inn?: string; email?: string; phone?: string
      legalAddress?: string; responsible?: string
    }

    const resolvedEmail = lc.email || company.email
    const resolvedInn   = lc.inn   || company.inn
    if (!resolvedInn || !resolvedEmail) {
      return apiError("Заполните ИНН и контактный email перед генерацией шаблона", 400)
    }

    const html = generateDefaultPrivacyPolicy({
      name:         lc.companyName || company.fullName || company.name,
      inn:          resolvedInn,
      legalAddress: lc.legalAddress ?? company.legalAddress,
      email:        resolvedEmail,
      phone:        lc.phone || company.phone || null,
      responsible:  lc.responsible || null,
    })

    return apiSuccess({ html })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[privacy-policy POST]", err)
    return apiError("Internal server error", 500)
  }
}
