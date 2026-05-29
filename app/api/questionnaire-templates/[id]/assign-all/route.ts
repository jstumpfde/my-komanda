import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { questionnaireTemplates } from "@/lib/db/schema"
import { isPlatformAdminEmail } from "@/lib/platform/auth"

// POST /api/questionnaire-templates/[id]/assign-all — «Назначить всем компаниям».
// Промоут анкеты в системную (is_system=true): становится видна ВСЕМ компаниям
// в библиотеке. Только платформенный админ (PLATFORM_ADMIN_EMAILS). Скрываем
// наличие фичи для остальных → 404, а не 403.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth().catch(() => null)
  if (!isPlatformAdminEmail(session?.user?.email)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  const { id } = await params

  const [updated] = await db
    .update(questionnaireTemplates)
    .set({ isSystem: true, updatedAt: new Date() })
    .where(eq(questionnaireTemplates.id, id))
    .returning()

  if (!updated) return NextResponse.json({ error: "Шаблон не найден" }, { status: 404 })

  return NextResponse.json({ ok: true })
}
