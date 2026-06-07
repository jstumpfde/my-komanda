import { NextRequest, NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { companies } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export async function GET() {
  let user
  try { user = await requireCompany() } catch (res) { return res as Response }

  const [company] = await db
    .select({ nancyVoiceJson: companies.nancyVoiceJson })
    .from(companies)
    .where(eq(companies.id, user.companyId))
    .limit(1)

  return NextResponse.json(company?.nancyVoiceJson ?? {})
}

export async function PATCH(req: NextRequest) {
  let user
  try { user = await requireCompany() } catch (res) { return res as Response }

  const body = await req.json() as {
    voice?: string; emotion?: string; speed?: number; ttsEnabled?: boolean
  }

  await db
    .update(companies)
    .set({ nancyVoiceJson: body })
    .where(eq(companies.id, user.companyId))

  return NextResponse.json({ ok: true })
}
