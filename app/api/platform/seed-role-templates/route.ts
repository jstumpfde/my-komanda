// POST /api/platform/seed-role-templates
//
// Идемпотентно засеивает системные шаблоны ролей (ТЗ №2). Сейчас — один:
// «Менеджер продаж B2B» (анкета + короткое демо + критерии + воронка v2).
// Защита: заголовок X-Platform-Admin-Key (env PLATFORM_ADMIN_KEY).
//
// Возвращает: { roleTemplateId, questionnaireTemplateId, demoTemplateId, created }

import { NextRequest, NextResponse } from "next/server"
import { requirePlatformKey } from "@/lib/platform/auth"
import { seedSalesManagerB2B } from "@/lib/hiring/role-templates/seed-sales-manager-b2b"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const denied = requirePlatformKey(req)
  if (denied) return denied

  try {
    // createdBy опускаем: это FK на users.id (uuid), а заголовок отдаёт email.
    const result = await seedSalesManagerB2B()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error("[platform/seed-role-templates]", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
