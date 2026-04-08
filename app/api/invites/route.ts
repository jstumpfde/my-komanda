import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { inviteLinks, users } from "@/lib/db/schema"
import { eq, and, desc } from "drizzle-orm"
import { randomBytes } from "crypto"

// Роли, которым разрешено создавать ссылки (включая legacy DB-имена)
const CAN_INVITE = ["platform_admin", "platform_manager", "director", "hr_lead", "admin", "manager"]

// ─── GET /api/invites — список ссылок компании ────────────────────────────────

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.companyId) return NextResponse.json({ error: "No company" }, { status: 403 })
  if (!CAN_INVITE.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const links = await db
    .select({
      id:        inviteLinks.id,
      token:     inviteLinks.token,
      role:      inviteLinks.role,
      label:     inviteLinks.label,
      maxUses:   inviteLinks.maxUses,
      usesCount: inviteLinks.usesCount,
      isActive:  inviteLinks.isActive,
      expiresAt: inviteLinks.expiresAt,
      createdAt: inviteLinks.createdAt,
      createdByName: users.name,
    })
    .from(inviteLinks)
    .leftJoin(users, eq(inviteLinks.createdBy, users.id))
    .where(eq(inviteLinks.companyId, session.user.companyId))
    .orderBy(desc(inviteLinks.createdAt))

  return NextResponse.json({ links })
}

// ─── POST /api/invites — создать ссылку ───────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.companyId) return NextResponse.json({ error: "No company" }, { status: 403 })
  if (!CAN_INVITE.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { role, label, maxUses, expiresInDays } = body as {
    role?: string
    label?: string
    maxUses?: number | null
    expiresInDays?: number | null
  }

  const VALID_ROLES = ["director", "hr_lead", "hr_manager", "department_head", "observer"]
  if (!role || !VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: "Неверная роль" }, { status: 400 })
  }

  const token = randomBytes(18).toString("base64url") // 24 символа, URL-safe

  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 86_400_000)
    : null

  const [link] = await db
    .insert(inviteLinks)
    .values({
      companyId: session.user.companyId,
      createdBy: session.user.id,
      token,
      role,
      label: label?.trim() || null,
      maxUses: maxUses ?? 1,
      expiresAt: expiresAt ?? undefined,
    })
    .returning()

  return NextResponse.json({ link }, { status: 201 })
}

// ─── DELETE /api/invites?id=xxx — деактивировать ──────────────────────────────

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.companyId) return NextResponse.json({ error: "No company" }, { status: 403 })
  if (!CAN_INVITE.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const id = new URL(req.url).searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  await db
    .update(inviteLinks)
    .set({ isActive: false })
    .where(
      and(
        eq(inviteLinks.id, id),
        eq(inviteLinks.companyId, session.user.companyId),
      )
    )

  return NextResponse.json({ ok: true })
}
