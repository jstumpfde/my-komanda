import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { questionnaireTemplates } from "@/lib/db/schema"
import { isPlatformAdminEmail } from "@/lib/platform/auth"

// POST /api/questionnaire-templates/[id]/unassign-all — «Снять у всех».
// НЕ удаляет: возвращает анкету в приватные (is_system=false) — она просто
// перестаёт быть видна другим компаниям, но остаётся у компании-владельца.
// Безопасно: вопросы, уже скопированные в вакансии, не затрагиваются (копия,
// не ссылка), копии шаблона у компаний — отдельные строки и не трогаются.
// Только платформенный админ (PLATFORM_ADMIN_EMAILS).
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
    .set({ isSystem: false, updatedAt: new Date() })
    .where(eq(questionnaireTemplates.id, id))
    .returning()

  if (!updated) return NextResponse.json({ error: "Шаблон не найден" }, { status: 404 })

  return NextResponse.json({ ok: true })
}
