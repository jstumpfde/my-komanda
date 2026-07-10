import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { accessRequests } from "@/lib/db/schema"
import { requirePlatformOperator } from "@/lib/platform/auth"
import {desc} from "drizzle-orm"
import { PRIVACY_POLICY_VERSION, MARKETING_CONSENT_VERSION } from "@/lib/legal/operator-requisites"
import { logRegistrationConsent } from "@/lib/legal/log-consent"

export async function GET() {
  // Платформенные лиды — только для платформенного админа
  try {
    await requirePlatformOperator()
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const rows = await db.select().from(accessRequests).orderBy(desc(accessRequests.createdAt))
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, email, phone, companyName, comment, marketingConsent } = body

    if (!name?.trim()) return NextResponse.json({ error: "Укажите имя" }, { status: 400 })
    if (!email?.trim()) return NextResponse.json({ error: "Укажите email" }, { status: 400 })

    const emailNormalized = email.trim().toLowerCase()

    const [request] = await db.insert(accessRequests).values({
      name: name.trim(),
      email: emailNormalized,
      phone: phone?.trim() || null,
      companyName: companyName?.trim() || null,
      comment: comment?.trim() || null,
    }).returning()

    // 152-ФЗ: чекбокс согласия на обработку ПД обязателен для сабмита формы
    // (см. app/(auth)/register/page.tsx — кнопка задизейблена без него), поэтому
    // раз заявка дошла — согласие дано. Пишем в журнал здесь же, на сервере
    // (раньше это был отдельный best-effort fetch с клиента, который молча
    // терялся при сбое — счётчик в /admin/platform оставался на нуле).
    await logRegistrationConsent({
      req,
      visitorId: emailNormalized,
      privacyPolicyVersion: PRIVACY_POLICY_VERSION,
      marketingConsent: marketingConsent === true,
      marketingConsentVersion: MARKETING_CONSENT_VERSION,
    })

    return NextResponse.json({ ok: true, id: request.id }, { status: 201 })
  } catch (error) {
    console.error("Access request error:", error)
    return NextResponse.json({ error: "Ошибка при отправке заявки" }, { status: 500 })
  }
}
