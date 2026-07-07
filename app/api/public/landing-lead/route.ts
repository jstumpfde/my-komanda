// POST /api/public/landing-lead — заявка с публичного лендинга (Юрий 07.07).
// Self-service регистрации нет — реальное предложение: заказать демонстрацию
// платформы или консультацию. Форма #request на /landing шлёт сюда.
//
// Анти-спам: honeypot-поле "website" (боты заполняют, люди не видят — тихий
// 200 без записи) + rate-limit 3 заявки/час по ip_hash, счёт по самой таблице
// landing_leads (не in-memory lib/rate-limit.ts — чтобы лимит переживал
// перезапуск процесса и был общим для нескольких инстансов).
//
// После записи — Telegram-алерт в платформенный канал Юрия. Переиспользуем
// sendTelegramAlert + platform-setting message_guard_alerts (тот же канал,
// что у стража сообщений, см. lib/messaging/guard-alert.ts) — не заводим
// отдельный ключ настройки под один узкий кейс. Ошибка Telegram НЕ роняет
// запись заявки (catch + log).
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { and, eq, gte, sql } from "drizzle-orm"
import { createHash } from "crypto"
import { db } from "@/lib/db"
import { landingLeads } from "@/lib/db/schema"
import { getPlatformSetting } from "@/lib/platform/settings"
import { sendTelegramAlert } from "@/lib/notifications/telegram"
import { MESSAGE_GUARD_ALERTS_KEY } from "@/lib/messaging/guard-alert"
import {
  isHoneypotTripped,
  isWithinLandingLeadRateLimit,
  LANDING_LEAD_RATE_LIMIT_MESSAGE,
  LANDING_LEAD_RATE_LIMIT_WINDOW_MS,
} from "@/lib/landing/lead-guard"

const LeadSchema = z.object({
  name: z.string().trim().min(2, "Укажите имя").max(100),
  contact: z.string().trim().min(5, "Укажите телефон, telegram или email").max(200),
  company: z.string().trim().max(200).optional().nullable(),
  interest: z.enum(["demo", "consultation"]).default("demo"),
  comment: z.string().trim().max(1000).optional().nullable(),
  source: z.string().trim().max(300).optional().nullable(),
  website: z.string().optional(), // honeypot
})

function computeIpHash(req: NextRequest): string | null {
  const forwardedFor = req.headers.get("x-forwarded-for")
  const ip = forwardedFor ? forwardedFor.split(",")[0]!.trim() : req.headers.get("x-real-ip")
  if (!ip) return null
  const salt = process.env.NEXTAUTH_SECRET ?? ""
  return createHash("sha256").update(`${ip}${salt}`).digest("hex")
}

const INTEREST_LABEL: Record<string, string> = {
  demo: "Демонстрация",
  consultation: "Консультация",
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 })
    }

    // Honeypot: боты заполняют скрытое поле — тихий успех, без записи в БД.
    if (isHoneypotTripped((body as Record<string, unknown>).website)) {
      return NextResponse.json({ ok: true })
    }

    const parsed = LeadSchema.safeParse(body)
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]?.message ?? "Проверьте поля формы"
      return NextResponse.json({ error: firstIssue }, { status: 400 })
    }
    const { name, contact, company, interest, comment, source } = parsed.data

    const ipHash = computeIpHash(req)
    if (ipHash) {
      const since = new Date(Date.now() - LANDING_LEAD_RATE_LIMIT_WINDOW_MS)
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(landingLeads)
        .where(and(eq(landingLeads.ipHash, ipHash), gte(landingLeads.createdAt, since)))
      if (!isWithinLandingLeadRateLimit(count)) {
        return NextResponse.json({ error: LANDING_LEAD_RATE_LIMIT_MESSAGE }, { status: 429 })
      }
    }

    const [lead] = await db.insert(landingLeads).values({
      name,
      contact,
      company: company || null,
      interest,
      comment: comment || null,
      source: source || null,
      ipHash,
    }).returning({ id: landingLeads.id })

    // Fire-and-forget: Telegram-алерт владельцу платформы. Не блокирует ответ
    // клиенту и не роняет запись заявки при сбое.
    void notifyLandingLead({ name, contact, company, interest, comment }).catch((err) => {
      console.warn("[landing-lead] telegram notify failed:", err instanceof Error ? err.message : err)
    })

    return NextResponse.json({ ok: true, id: lead.id }, { status: 201 })
  } catch (error) {
    console.error("Landing lead error:", error)
    return NextResponse.json({ error: "Ошибка при отправке заявки" }, { status: 500 })
  }
}

async function notifyLandingLead(lead: {
  name: string
  contact: string
  company?: string | null
  interest: string
  comment?: string | null
}): Promise<void> {
  const cfg = await getPlatformSetting<{ allToOne?: boolean; chatId?: string }>(MESSAGE_GUARD_ALERTS_KEY)
  const chatId = cfg?.chatId
  if (!chatId) return

  const parts = [
    lead.name,
    lead.contact,
    INTEREST_LABEL[lead.interest] ?? lead.interest,
    lead.company || null,
    lead.comment || null,
  ].filter(Boolean)

  const text = `🔥 <b>Заявка с лендинга</b>: ${parts.join(" · ")}`
  await sendTelegramAlert(chatId, text)
}
