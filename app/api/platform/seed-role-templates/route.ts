// POST /api/platform/seed-role-templates
//
// Идемпотентно засеивает системные шаблоны ролей (ТЗ №2).
// Шаблоны: «Менеджер продаж B2B» + «Маркетолог (B2B)».
// Защита: заголовок X-Platform-Admin-Key (env PLATFORM_ADMIN_KEY).
//
// Возвращает: { templates: [{ slug, roleTemplateId, questionnaireTemplateId, demoTemplateId, created }] }

import { NextRequest, NextResponse } from "next/server"
import { requirePlatformKey } from "@/lib/platform/auth"
import { seedSalesManagerB2B } from "@/lib/hiring/role-templates/seed-sales-manager-b2b"
import { seedMarketer } from "@/lib/hiring/role-templates/seed-marketer"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const denied = requirePlatformKey(req)
  if (denied) return denied

  try {
    // createdBy опускаем: это FK на users.id (uuid), а заголовок отдаёт email.
    const [salesResult, marketerResult] = await Promise.all([
      seedSalesManagerB2B(),
      seedMarketer(),
    ])
    return NextResponse.json({
      ok: true,
      templates: [
        { slug: "sales-manager-b2b", ...salesResult },
        { slug: "marketer", ...marketerResult },
      ],
    })
  } catch (err) {
    console.error("[platform/seed-role-templates]", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
