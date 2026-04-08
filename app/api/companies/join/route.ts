import { NextRequest, NextResponse } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies, users } from "@/lib/db/schema"
import { auth } from "@/auth"

// GET /api/companies/join?code=xxx — validate join code
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code")
  if (!code) return NextResponse.json({ error: "Код не указан" }, { status: 400 })

  const [company] = await db
    .select({ id: companies.id, name: companies.name, joinEnabled: companies.joinEnabled })
    .from(companies)
    .where(and(eq(companies.joinCode, code), eq(companies.joinEnabled, true)))
    .limit(1)

  if (!company) return NextResponse.json({ error: "Ссылка недействительна" }, { status: 404 })

  return NextResponse.json({ company: { id: company.id, name: company.name } })
}

// POST /api/companies/join — join company by code (authenticated user)
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { code } = await req.json() as { code?: string }
  if (!code) return NextResponse.json({ error: "Код не указан" }, { status: 400 })

  // Already in a company?
  if (session.user.companyId) {
    return NextResponse.json({ error: "Вы уже состоите в компании" }, { status: 400 })
  }

  const [company] = await db
    .select({ id: companies.id, name: companies.name, joinEnabled: companies.joinEnabled })
    .from(companies)
    .where(and(eq(companies.joinCode, code), eq(companies.joinEnabled, true)))
    .limit(1)

  if (!company) return NextResponse.json({ error: "Ссылка недействительна" }, { status: 404 })

  // Assign user to company with "employee" role
  await db
    .update(users)
    .set({ companyId: company.id, role: "employee" })
    .where(eq(users.id, session.user.id))

  return NextResponse.json({ ok: true, companyName: company.name })
}
