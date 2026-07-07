// POST /api/public/tip/ref — привязать текущего анонимного пользователя
// (cookie tip_uid) к рефереру по коду ?ref=<код> (см. /tip?ref=...).
//
// Намеренно ВСЕГДА отвечает 200 — успех/неуспех НЕ различаем в ответе
// (антифрод: не подсказываем, что код невалиден/уже использован/чужой).
// balanceRuns возвращаем в теле только при реальной привязке — так UI может
// показать «вам начислено N прогонов», а в остальных случаях просто получает
// пустой объект и молчит.

import { NextRequest, NextResponse } from "next/server"
import { getOrCreateTipUser } from "@/lib/tip/session"
import { attachReferral } from "@/lib/tip/referral"

export const runtime = "nodejs"

interface RefRequestBody {
  code?: string
}

export async function POST(req: NextRequest) {
  try {
    let body: RefRequestBody
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({})
    }

    const code = body.code?.trim()
    if (!code) return NextResponse.json({})

    const user = await getOrCreateTipUser()
    const result = await attachReferral(user.id, code)

    if (result.attached) {
      return NextResponse.json({ balanceRuns: result.balanceRuns })
    }
    return NextResponse.json({})
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[tip] POST /api/public/tip/ref", e)
    return NextResponse.json({})
  }
}
