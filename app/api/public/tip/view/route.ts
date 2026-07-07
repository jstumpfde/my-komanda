// POST /api/public/tip/view — регистрирует просмотр расшаренного разбора
// «Типология» (/tip/r/[shareToken]) для аналитики чтения (владельцу).
//
// Fire-and-forget по контракту: клиент шлёт короткие тики (раз в несколько
// секунд, накопление времени/скролла), нам важно не блокировать рендер
// страницы и не шуметь ошибками — всегда отвечаем 200 {} независимо от
// исхода (viewerUid = владелец, разбор не найден и т.п. тихо игнорируются
// внутри recordView).

import { NextRequest, NextResponse } from "next/server"
import { getOrCreateTipUser } from "@/lib/tip/session"
import { recordView } from "@/lib/tip/analytics"

export const runtime = "nodejs"

interface ViewRequestBody {
  token?: string
  seconds?: number
  scrollPct?: number
  source?: string
}

export async function POST(req: NextRequest) {
  try {
    let body: ViewRequestBody
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({})
    }

    const token = body.token?.trim()
    if (!token) return NextResponse.json({})

    const user = await getOrCreateTipUser()

    await recordView({
      shareToken: token,
      viewerUid: user.id,
      source: body.source,
      addSeconds: clampNumber(body.seconds, 0, 30),
      scrollPct: clampNumber(body.scrollPct, 0, 100),
    })
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[tip] POST /api/public/tip/view", e)
  }

  return NextResponse.json({})
}

function clampNumber(n: number | undefined, min: number, max: number): number {
  if (typeof n !== "number" || Number.isNaN(n)) return min
  return Math.max(min, Math.min(max, n))
}
