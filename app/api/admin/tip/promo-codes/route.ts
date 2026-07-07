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

// Формат обычных кодов (с 07.07): 3 буквы + 4 цифры слитно, например KHB2622.
// Буквы — подмножество, визуально совпадающее с кириллицей (легко
// продиктовать/перепечатать), цифры 2-9 (без 0/1, чтобы не путать с О/I).
// Личные коды-пропуска (lib/tip/personal-code.ts) длиннее и с другим
// префиксом — их сюда не относится, они не генерируются этим роутом.
const LETTERS_ALPHABET = "ABCEHKMPTX"
const DIGITS_ALPHABET = "23456789"

function randomFromAlphabet(len: number, alphabet: string): string {
  const bytes = randomBytes(len)
  let out = ""
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length]
  return out
}

function generateCode(): string {
  return `${randomFromAlphabet(3, LETTERS_ALPHABET)}${randomFromAlphabet(4, DIGITS_ALPHABET)}`
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

  // Личный код — пароль в аккаунт владельца. Маскируем НА СЕРВЕРЕ (guard-major
  // 07.07: клиентская маска — косметика, полный код утекал в JSON и был виден
  // любому админу через Network/curl). Владелец узнаёт свой код сам через
  // /code в боте — админке полное значение не нужно.
  const safe = rows.map((r) =>
    r.isPersonal ? { ...r, code: `${r.code.slice(0, 3)}••••••••` } : r,
  )

  return NextResponse.json({ codes: safe })
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
