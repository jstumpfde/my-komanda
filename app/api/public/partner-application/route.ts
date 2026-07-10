import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { accessRequests } from "@/lib/db/schema"
import { checkRateLimit } from "@/lib/rate-limit"
import { PRIVACY_POLICY_VERSION, MARKETING_CONSENT_VERSION } from "@/lib/legal/operator-requisites"
import { logRegistrationConsent } from "@/lib/legal/log-consent"

// POST /api/public/partner-application
//
// Публичная (БЕЗ авторизации) саморегистрация партнёра. Вставляет заявку в
// access_requests со status='new', requestType='partner'. Оператор платформы
// затем одобряет её в /admin/requests → создаётся компания + партнёр-логин.
//
// Анти-спам минимальный: обязательные имя/email, валидный формат email,
// лимиты длины полей (отсекаем мусорные/слишком большие тела).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown"
    if (!checkRateLimit(`partner-app:${ip}`, 5, 60000)) {
      return NextResponse.json({ error: "Слишком много запросов, попробуйте позже" }, { status: 429 })
    }

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 })
    }

    const name = typeof body.name === "string" ? body.name.trim() : ""
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
    const phone = typeof body.phone === "string" ? body.phone.trim() : ""
    const companyName = typeof body.companyName === "string" ? body.companyName.trim() : ""
    const comment = typeof body.comment === "string" ? body.comment.trim() : ""

    if (!name) return NextResponse.json({ error: "Укажите имя" }, { status: 400 })
    if (!email) return NextResponse.json({ error: "Укажите email" }, { status: 400 })
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Некорректный email" }, { status: 400 })
    }

    // Анти-спам: разумные лимиты длины.
    if (name.length > 200 || email.length > 200 || phone.length > 50 ||
        companyName.length > 200 || comment.length > 2000) {
      return NextResponse.json({ error: "Слишком длинное значение в одном из полей" }, { status: 400 })
    }

    const [request] = await db.insert(accessRequests).values({
      name,
      email,
      phone: phone || null,
      companyName: companyName || null,
      comment: comment || null,
      status: "new",
      requestType: "partner",
    }).returning({ id: accessRequests.id })

    // 152-ФЗ: чекбокс согласия обязателен для сабмита формы (см.
    // app/(auth)/register/partner/page.tsx), пишем факт в журнал согласий
    // здесь же на сервере — надёжнее, чем отдельный best-effort fetch с клиента.
    const marketingConsent = typeof body.marketingConsent === "boolean" ? body.marketingConsent : false
    await logRegistrationConsent({
      req,
      visitorId: email,
      privacyPolicyVersion: PRIVACY_POLICY_VERSION,
      marketingConsent,
      marketingConsentVersion: MARKETING_CONSENT_VERSION,
    })

    return NextResponse.json({ ok: true, id: request.id }, { status: 201 })
  } catch (error) {
    console.error("Partner application error:", error)
    return NextResponse.json({ error: "Ошибка при отправке заявки" }, { status: 500 })
  }
}
