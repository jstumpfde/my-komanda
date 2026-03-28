import { NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { skills } from "@/lib/db/schema"
import { isNull, count } from "drizzle-orm"

const SYSTEM_SKILLS = [
  { name: "Работа с CRM",          category: "tool" },
  { name: "Холодные звонки",        category: "hard" },
  { name: "Переговоры",             category: "hard" },
  { name: "Презентации",            category: "soft" },
  { name: "Аналитика данных",       category: "hard" },
  { name: "Управление проектами",   category: "domain" },
  { name: "Excel",                  category: "tool" },
  { name: "Коммуникация",           category: "soft" },
  { name: "Тайм-менеджмент",        category: "soft" },
  { name: "Командная работа",       category: "soft" },
]

export async function GET() {
  try { await requireCompany() } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  const [existing] = await db.select({ val: count() }).from(skills).where(isNull(skills.tenantId))
  if ((existing?.val ?? 0) > 0) {
    return NextResponse.json({ message: "Already seeded", count: existing.val })
  }

  const inserted = await db.insert(skills).values(
    SYSTEM_SKILLS.map(s => ({ ...s, tenantId: null }))
  ).returning()

  return NextResponse.json({ seeded: inserted.length })
}
