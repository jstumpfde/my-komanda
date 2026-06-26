// Чтение данных трекера для страницы /admin/dev-activity и ручной запуск сбора.
// Доступ — по сессии (canSeeDevActivity): владелец / платформенная роль /
// платформенный email / DEV_ACTIVITY_EMAILS. Посторонним — 404 (прячем раздел).

import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { canSeeDevActivity } from "@/lib/dev-activity/access"
import { getAllSeries, collectAndStore } from "@/lib/dev-activity/store"

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET() {
  const session = await auth()
  if (!canSeeDevActivity(session?.user?.email, session?.user?.role as string)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  const projects = await getAllSeries()
  return NextResponse.json({ projects })
}

// Ручной «Собрать сейчас» из шапки страницы.
export async function POST() {
  const session = await auth()
  if (!canSeeDevActivity(session?.user?.email, session?.user?.role as string)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  try {
    const result = await collectAndStore()
    const projects = await getAllSeries()
    return NextResponse.json({ ok: true, result, projects })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
