import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { inviteLinks, users } from "@/lib/db/schema"
import { eq, sql } from "drizzle-orm"
import { triggerOnboarding } from "@/lib/knowledge/onboarding"

// POST /api/invites/accept — принять приглашение (нужна авторизация)
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { token } = body as { token?: string }
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 })

  // Найти ссылку по токену; активность/срок проверяем НИЖЕ — после проверки
  // идемпотентности, чтобы уже вступивший не упирался в исчерпанную ссылку
  const [link] = await db
    .select()
    .from(inviteLinks)
    .where(eq(inviteLinks.token, token))
    .limit(1)

  if (!link) {
    return NextResponse.json({ error: "Ссылка недействительна или истекла" }, { status: 404 })
  }

  // Идемпотентность: пользователь уже состоит в ЭТОЙ компании (типовой случай —
  // аккаунт создан по этой же ссылке через /api/invites/register, автовход не
  // сработал, человек вошёл вручную и снова жмёт «принять») — успех без
  // повторного расхода использования.
  if (session.user.companyId === link.companyId) {
    return NextResponse.json({ ok: true, companyId: link.companyId, role: session.user.role })
  }

  if (!link.isActive || (link.expiresAt !== null && link.expiresAt <= new Date())) {
    return NextResponse.json({ error: "Ссылка недействительна или истекла" }, { status: 404 })
  }

  // Проверить лимит
  if (link.maxUses !== null && (link.usesCount ?? 0) >= link.maxUses) {
    return NextResponse.json({ error: "Лимит использований исчерпан" }, { status: 410 })
  }

  // Защита от tenant-эскейпа: пользователь уже состоит в ДРУГОЙ компании —
  // нельзя молча перезаписать его companyId/role данными из чужой ссылки.
  if (session.user.companyId && session.user.companyId !== link.companyId) {
    return NextResponse.json(
      { error: "Вы уже состоите в другой компании. Сначала покиньте текущую." },
      { status: 409 }
    )
  }

  // Обновить companyId и роль пользователя
  await db
    .update(users)
    .set({
      companyId: link.companyId,
      role: link.role,
    })
    .where(eq(users.id, session.user.id))

  // Увеличить счётчик, деактивировать если достигнут лимит
  const newUsesCount = (link.usesCount ?? 0) + 1
  const shouldDeactivate = link.maxUses !== null && newUsesCount >= link.maxUses

  await db
    .update(inviteLinks)
    .set({
      usesCount: sql`${inviteLinks.usesCount} + 1`,
      isActive: shouldDeactivate ? false : link.isActive,
    })
    .where(eq(inviteLinks.id, link.id))

  // After-insert hook: автоподбор плана обучения + приветствие в Telegram
  try {
    await triggerOnboarding(link.companyId, session.user.id)
  } catch (err) {
    console.error("[invites/accept] onboarding trigger failed", err)
  }

  return NextResponse.json({ ok: true, companyId: link.companyId, role: link.role })
}
