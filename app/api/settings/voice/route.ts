import { NextRequest, NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { companies } from "@/lib/db/schema"
import type { NancyVoiceSettings } from "@/lib/db/schema"
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

  const body = await req.json() as Partial<NancyVoiceSettings>

  // Читаем текущее значение и делаем merge, чтобы не затирать другие ключи
  const [current] = await db
    .select({ nancyVoiceJson: companies.nancyVoiceJson })
    .from(companies)
    .where(eq(companies.id, user.companyId))
    .limit(1)

  const existing = (current?.nancyVoiceJson ?? {}) as NancyVoiceSettings
  const merged: NancyVoiceSettings = { ...existing, ...body }

  await db
    .update(companies)
    .set({ nancyVoiceJson: merged })
    .where(eq(companies.id, user.companyId))

  return NextResponse.json({ ok: true })
}
