// POST /api/public/big-life/orders — заказ из корзины biglife.company24.pro
// (Big Life Covers.dc.html + Big Life Reader.dc.html). Статический сайт живёт
// на другом поддомене и не в этом репозитории — публичный, БЕЗ авторизации,
// с CORS (см. app/api/public/client-pages/track/route.ts — тот же паттерн
// cross-origin для статики Big Life).
//
// БЕЗ оплаты (Юрий пока не дал ключи Робокассы) — это захват заказа: доставка
// + контакты + согласия 152-ФЗ, статус 'new' до ручной обработки HR/менеджером
// Big Life через /big-life/orders. Не путать с реальной транзакцией — ответ
// клиенту НЕ утверждает, что оплата прошла.
//
// Анти-спам: honeypot "website" + rate-limit по ip_hash (lib/big-life/order-guard.ts,
// тот же приём, что и lib/landing/lead-guard.ts у POST /api/public/landing-lead).
//
// 152-ФЗ: согласие на обработку ПД и принятие оферты — ОБЯЗАТЕЛЬНЫ, проверяются
// СЕРВЕРНО (клиентский гейт на кнопке — не защита), рассылка — опционально.
// Тот же паттерн, что /portfolio + POST /api/public/landing-lead: privacy_policy
// и marketing (если отмечен) дополнительно пишутся в общий журнал согласий
// consent_log (см. lib/legal/log-consent.ts, /admin/platform → Согласия);
// оферта отдельного consentType в consentLog не имеет — её факт/время хранится
// только в самой строке заказа (consent_offer_at).
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { and, eq, gte, sql } from "drizzle-orm"
import { createHash } from "crypto"
import { db } from "@/lib/db"
import { bigLifeOrders } from "@/lib/db/schema"
import { BIGLIFE_COMPANY_ID } from "@/lib/big-life/constants"
import { insertConsentLog } from "@/lib/legal/log-consent"
import { PRIVACY_POLICY_VERSION, MARKETING_CONSENT_VERSION } from "@/lib/legal/operator-requisites"
import {
  isHoneypotTripped,
  isWithinBigLifeOrderRateLimit,
  BIGLIFE_ORDER_RATE_LIMIT_MESSAGE,
  BIGLIFE_ORDER_RATE_LIMIT_WINDOW_MS,
} from "@/lib/big-life/order-guard"

export const dynamic = "force-dynamic"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

const ItemSchema = z.object({
  coverId: z.string().trim().max(100),
  coverTitle: z.string().trim().min(1).max(300),
  price: z.number().int().min(0).max(1_000_000),
  qty: z.number().int().min(1).max(50),
})

const OrderSchema = z.object({
  items: z.array(ItemSchema).min(1, "Корзина пуста"),
  deliveryMethod: z.enum(["russia_post", "moscow_courier"]),
  deliveryAddress: z.string().trim().min(5, "Укажите адрес доставки").max(500),
  contactName: z.string().trim().min(2, "Укажите имя").max(150),
  phone: z.string().trim().min(5, "Укажите телефон").max(50),
  website: z.string().optional(), // honeypot
  consentPrivacy: z.boolean(),
  consentOffer: z.boolean(),
  consentMarketing: z.boolean().optional(),
}).refine((v) => v.consentPrivacy === true, {
  message: "Нужно согласие на обработку персональных данных",
  path: ["consentPrivacy"],
}).refine((v) => v.consentOffer === true, {
  message: "Нужно принять условия оферты",
  path: ["consentOffer"],
})

function computeIpHash(req: NextRequest): string | null {
  const forwardedFor = req.headers.get("x-forwarded-for")
  const ip = forwardedFor ? forwardedFor.split(",")[0]!.trim() : req.headers.get("x-real-ip")
  if (!ip) return null
  const salt = process.env.NEXTAUTH_SECRET ?? ""
  return createHash("sha256").update(`${ip}${salt}`).digest("hex")
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Некорректный запрос" }, { status: 400, headers: CORS })
    }

    // Honeypot: боты заполняют скрытое поле — тихий успех, без записи в БД.
    if (isHoneypotTripped((body as Record<string, unknown>).website)) {
      return NextResponse.json({ ok: true }, { headers: CORS })
    }

    const parsed = OrderSchema.safeParse(body)
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]?.message ?? "Проверьте поля формы"
      return NextResponse.json({ error: firstIssue }, { status: 400, headers: CORS })
    }
    const {
      items, deliveryMethod, deliveryAddress, contactName, phone,
      consentPrivacy, consentOffer, consentMarketing,
    } = parsed.data

    const ipHash = computeIpHash(req)
    if (ipHash) {
      const since = new Date(Date.now() - BIGLIFE_ORDER_RATE_LIMIT_WINDOW_MS)
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(bigLifeOrders)
        .where(and(eq(bigLifeOrders.ipHash, ipHash), gte(bigLifeOrders.createdAt, since)))
      if (!isWithinBigLifeOrderRateLimit(count)) {
        return NextResponse.json({ error: BIGLIFE_ORDER_RATE_LIMIT_MESSAGE }, { status: 429, headers: CORS })
      }
    }

    const totalPrice = items.reduce((sum, i) => sum + i.price * i.qty, 0)
    const now = new Date()

    const [order] = await db.insert(bigLifeOrders).values({
      companyId: BIGLIFE_COMPANY_ID,
      items,
      totalPrice,
      deliveryMethod,
      deliveryAddress,
      contactName,
      phone,
      consentPrivacyAt: now,
      consentOfferAt: now,
      consentMarketingAt: consentMarketing ? now : null,
      ipHash,
    }).returning({ id: bigLifeOrders.id })

    // 152-ФЗ: логируем в единый журнал согласий (best-effort, не роняет заказ).
    try {
      await insertConsentLog({
        req,
        visitorId: phone,
        consentType: "privacy_policy",
        documentVersion: PRIVACY_POLICY_VERSION,
      })
      if (consentMarketing === true) {
        await insertConsentLog({
          req,
          visitorId: phone,
          consentType: "marketing",
          documentVersion: MARKETING_CONSENT_VERSION,
        })
      }
    } catch (err) {
      console.error("[big-life/orders] consent log write failed:", err instanceof Error ? err.message : err)
    }

    return NextResponse.json({ ok: true, id: order.id }, { status: 201, headers: CORS })
  } catch (error) {
    console.error("[big-life/orders] POST error:", error)
    return NextResponse.json({ error: "Ошибка при отправке заказа" }, { status: 500, headers: CORS })
  }
}
