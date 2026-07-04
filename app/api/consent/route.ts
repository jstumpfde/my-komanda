import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { consentLog } from "@/lib/db/schema"

// Публичный роут — пишет факт согласия/отказа (cookie-баннер, чекбоксы
// регистрации/подписки на рассылку) в журнал 152-ФЗ. Без сессии: анонимный
// посетитель тоже должен иметь возможность зафиксировать согласие на cookie
// ДО регистрации. Если пользователь уже залогинен — привязываем к его userId,
// сверх переданного visitorId (сохраняем оба, это не взаимоисключающе).
//
// consentType: 'cookie' | 'privacy_policy' | 'marketing'
// action:      'accepted' | 'rejected' | 'partial'

const CONSENT_TYPES = new Set(["cookie", "privacy_policy", "marketing"])
const ACTIONS = new Set(["accepted", "rejected", "partial"])

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ error: "Bad request" }, { status: 400 })

    const { consentType, action, documentVersion, visitorId, details } = body as {
      consentType?: string
      action?: string
      documentVersion?: string
      visitorId?: string
      details?: Record<string, unknown>
    }

    if (!consentType || !CONSENT_TYPES.has(consentType)) {
      return NextResponse.json({ error: "Invalid consentType" }, { status: 400 })
    }
    if (!action || !ACTIONS.has(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }
    if (!documentVersion || typeof documentVersion !== "string") {
      return NextResponse.json({ error: "Invalid documentVersion" }, { status: 400 })
    }

    const session = await auth().catch(() => null)
    const userId = session?.user?.id ?? null

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      null
    const userAgent = req.headers.get("user-agent") || null

    const [row] = await db
      .insert(consentLog)
      .values({
        userId,
        visitorId: typeof visitorId === "string" ? visitorId.slice(0, 200) : null,
        consentType,
        action,
        documentVersion: documentVersion.slice(0, 50),
        details: details && typeof details === "object" ? details : null,
        ipAddress: ip,
        userAgent,
      })
      .returning({ id: consentLog.id })

    return NextResponse.json({ ok: true, id: row?.id })
  } catch (err) {
    console.error("POST /api/consent:", err instanceof Error ? err.message : err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
