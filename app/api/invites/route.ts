import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { inviteLinks, users, companies } from "@/lib/db/schema"
import { eq, and, desc } from "drizzle-orm"
import { randomBytes } from "crypto"

// Приглашения — управление командой, только директор (компанийская настройка).
// Включая legacy DB-имена (client = director). hr_lead больше не приглашает.
const CAN_INVITE = ["platform_admin", "platform_manager", "director", "client", "admin", "manager"]

// Бренд-слаг компании для читаемого адреса приглашения /invite/{slug}-{random}.
// Источник: subdomain → joinCode → транслит названия. Только [a-z0-9-], ≤24 симв.
const TRANSLIT: Record<string, string> = {
  а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"e",ж:"zh",з:"z",и:"i",й:"y",к:"k",л:"l",м:"m",
  н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"h",ц:"c",ч:"ch",ш:"sh",щ:"sch",
  ъ:"",ы:"y",ь:"",э:"e",ю:"yu",я:"ya",
}
function companySlug(c: { subdomain?: string | null; joinCode?: string | null; name?: string | null }): string {
  let raw = (c.subdomain || c.joinCode || "").trim()
  if (!raw) raw = (c.name || "").toLowerCase().split("").map(ch => TRANSLIT[ch] ?? ch).join("")
  const slug = raw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24)
  return slug || "team"
}

// ~10 символов base62 — против перебора достаточно (62^10 ≈ 8·10^17),
// плюс одноразовость + срок. Не убираем случайную часть целиком.
const BASE62 = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
function shortRandom(len = 10): string {
  const bytes = randomBytes(len)
  let out = ""
  for (let i = 0; i < len; i++) out += BASE62[bytes[i] % 62]
  return out
}

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

  // Читаемый бренд-токен: /invite/{slug}-{random}. Хранится и ищется целиком
  // (exact match), поэтому парсинг при приёме приглашения не нужен.
  const [company] = await db
    .select({ subdomain: companies.subdomain, joinCode: companies.joinCode, name: companies.name })
    .from(companies)
    .where(eq(companies.id, session.user.companyId))
    .limit(1)
  const token = `${companySlug(company ?? {})}-${shortRandom(10)}`

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
