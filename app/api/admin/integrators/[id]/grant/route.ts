// POST /api/admin/integrators/[id]/grant  body: { email }
// Делает пользователя партнёром: роль 'partner' + привязка к компании-партнёру
// (integrator.companyId). После этого пользователь видит кабинет /partner и
// только своих клиентов. Только для админов платформы.
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { integrators, users } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { isPlatformAdminEmail } from "@/lib/platform/auth"

function isAdmin(role?: string): boolean {
  return !!role && ["platform_admin", "platform_manager", "admin"].includes(role)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isAdmin(session.user.role) && !isPlatformAdminEmail(session.user.email)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { id } = await params

  const { email } = await req.json() as { email?: string }
  const normEmail = (email ?? "").trim().toLowerCase()
  if (!normEmail) return NextResponse.json({ error: "email обязателен" }, { status: 400 })

  const [integrator] = await db.select({ companyId: integrators.companyId }).from(integrators).where(eq(integrators.id, id)).limit(1)
  if (!integrator) return NextResponse.json({ error: "Партнёр не найден" }, { status: 404 })

  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, normEmail)).limit(1)
  if (!user) return NextResponse.json({ error: "Пользователь с таким email не найден" }, { status: 404 })

  const [updated] = await db.update(users)
    .set({ role: "partner", companyId: integrator.companyId })
    .where(eq(users.id, user.id))
    .returning({ id: users.id, email: users.email, role: users.role })

  return NextResponse.json({ user: updated })
}
