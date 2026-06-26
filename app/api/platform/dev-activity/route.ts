// Чтение данных трекера для страницы /admin/dev-activity и ручной запуск сбора.
// Доступ — по сессии (canSeeDevActivity): владелец / платформенный админ /
// поимённый список DEV_ACTIVITY_EMAILS. Посторонним — 404 (прячем раздел).

import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { canSeeDevActivity } from "@/lib/dev-activity/access"
import { getSeries, collectAndStore } from "@/lib/dev-activity/store"

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET() {
  const session = await auth()
  if (!canSeeDevActivity(session?.user?.email)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  const data = await getSeries()
  return NextResponse.json(data)
}

// Ручной «Собрать сейчас» из шапки страницы.
export async function POST() {
  const session = await auth()
  if (!canSeeDevActivity(session?.user?.email)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  try {
    const result = await collectAndStore()
    const data = await getSeries()
    return NextResponse.json({ ok: true, result, data })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
