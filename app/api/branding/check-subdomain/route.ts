import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { companies } from "@/lib/db/schema"
import { eq, and, ne } from "drizzle-orm"
import { requireCompany } from "@/lib/api-helpers"

export async function GET(req: NextRequest) {
  let user: Awaited<ReturnType<typeof requireCompany>>
  try {
    user = await requireCompany()
  } catch (e) {
    return e as NextResponse
  }

  const subdomain = req.nextUrl.searchParams.get("subdomain")?.trim().toLowerCase()
  if (!subdomain) {
    return NextResponse.json({ available: false, error: "Укажите поддомен" }, { status: 400 })
  }

  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(subdomain) || subdomain.length < 3) {
    return NextResponse.json({ available: false, error: "Минимум 3 символа, только латиница, цифры и дефис" })
  }

  const existing = await db
    .select({ id: companies.id })
    .from(companies)
    .where(and(eq(companies.subdomain, subdomain), ne(companies.id, user.companyId)))
    .limit(1)

  return NextResponse.json({ available: existing.length === 0 })
}
