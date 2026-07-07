// GET /api/public/tip/me — баланс прогонов и сохранённые предпочтения текущего
// анонимного пользователя (создаёт пользователя лениво, если ещё не было).

import { NextResponse } from "next/server"
import { getOrCreateTipUser } from "@/lib/tip/session"

export const runtime = "nodejs"

export async function GET() {
  const user = await getOrCreateTipUser()
  return NextResponse.json({
    balanceRuns: user.balanceRuns,
    prefs: user.prefsJson ?? {},
  })
}
