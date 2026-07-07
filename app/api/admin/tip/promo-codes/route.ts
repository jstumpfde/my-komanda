// /api/admin/tip/promo-codes — генерация и список промокодов «Типологии».
// Гейт — тот же паттерн, что /admin/platform: requireAdminPanelAccess
// (платформенная роль ИЛИ email из PLATFORM_ADMIN_EMAILS).

import { NextRequest, NextResponse } from "next/server"
import { randomBytes } from "node:crypto"
import { desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { tipPromoCodes } from "@/lib/db/schema"
import { requireAdminPanelAccess } from "@/lib/platform/auth"

export const dynamic = "force-dynamic"

// Без неоднозначных символов: без 0/O, без 1/I.
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"

function randomSegment(len: number): string {
  const bytes = randomBytes(len)
  let out = ""
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
  return out
}

function generateCode(): string {
  return `TIP-${randomSegment(4)}-${randomSegment(4)}`
}

async function generateUniqueCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateCode()
    const [existing] = await db
      .select({ id: tipPromoCodes.id })
      .from(tipPromoCodes)
      .where(eq(tipPromoCodes.code, code))
      .limit(1)
    if (!existing) return code
  }
  throw new Error("Не удалось сгенерировать уникальный код")
}

export async function GET(req: NextRequest) {
  try {
    await requireAdminPanelAccess()
  } catch (e) {
    return e as Response
  }

  const { searchParams } = new URL(req.url)
  const source = searchParams.get("source")?.trim()

  const rows = await db
    .select()
    .from(tipPromoCodes)
    .where(source ? eq(tipPromoCodes.sourceLabel, source) : undefined)
    .orderBy(desc(tipPromoCodes.createdAt))
    .limit(500)

  return NextResponse.json({ codes: rows })
}

export async function POST(req: NextRequest) {
  try {
    await requireAdminPanelAccess()
  } catch (e) {
    return e as Response
  }

  const body = await req.json().catch(() => ({})) as {
    count?: unknown
    runsGranted?: unknown
    maxActivations?: unknown
    sourceLabel?: unknown
    expiresAt?: unknown
    isFreeLink?: unknown
  }

  const count = Number(body.count)
  if (!Number.isInteger(count) || count < 1 || count > 100) {
    return NextResponse.json({ error: "count должен быть целым числом от 1 до 100" }, { status: 400 })
  }

  const runsGranted = Number(body.runsGranted)
  if (!Number.isInteger(runsGranted) || runsGranted < 1) {
    return NextResponse.json({ error: "runsGranted должен быть положительным целым числом" }, { status: 400 })
  }

  let maxActivations: number | null = null
  if (body.maxActivations !== undefined && body.maxActivations !== null && body.maxActivations !== "") {
    const n = Number(body.maxActivations)
    if (!Number.isInteger(n) || n < 1) {
      return NextResponse.json({ error: "maxActivations должен быть положительным целым числом или пустым (без лимита)" }, { status: 400 })
    }
    maxActivations = n
  }

  const sourceLabel = typeof body.sourceLabel === "string" && body.sourceLabel.trim().length > 0
    ? body.sourceLabel.trim().slice(0, 200)
    : null

  let expiresAt: Date | null = null
  if (typeof body.expiresAt === "string" && body.expiresAt.trim().length > 0) {
    const d = new Date(body.expiresAt)
    if (isNaN(d.getTime())) {
      return NextResponse.json({ error: "expiresAt — некорректная дата" }, { status: 400 })
    }
    expiresAt = d
  }

  const isFreeLink = body.isFreeLink === true

  try {
    const created: (typeof tipPromoCodes.$inferSelect)[] = []
    for (let i = 0; i < count; i++) {
      const code = await generateUniqueCode()
      const [row] = await db.insert(tipPromoCodes).values({
        code,
        runsGranted,
        maxActivations,
        isFreeLink,
        sourceLabel,
        expiresAt,
      }).returning()
      created.push(row)
    }
    return NextResponse.json({ ok: true, codes: created })
  } catch (err) {
    console.error("[admin/tip/promo-codes POST]", err)
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
