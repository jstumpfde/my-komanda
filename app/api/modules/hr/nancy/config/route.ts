// GET /api/modules/hr/nancy/config
//
// Возвращает конфигурацию ассистента Нэнси для текущей компании.
// Доступен всем авторизованным пользователям компании (requireCompany).
// Используется виджетом nancy-assistant.tsx при монтировании.

import { NextResponse } from "next/server"
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

  const cfg = (company?.nancyVoiceJson ?? {}) as NancyVoiceSettings

  return NextResponse.json({
    enabled:            cfg.enabled          ?? true,
    name:               cfg.name             ?? "",
    greeting:           cfg.greeting         ?? "",
    visibleToRoles:     cfg.visibleToRoles   ?? [],
    modules:            cfg.modules          ?? [],
    customInstructions: cfg.customInstructions ?? "",
  })
}
