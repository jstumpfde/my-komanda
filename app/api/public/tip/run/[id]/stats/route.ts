// GET /api/public/tip/run/[id]/stats — статистика просмотров расшаренного
// разбора. Доступ ТОЛЬКО владельцу прогона (идентификация — cookie tip_uid,
// см. lib/tip/session.ts), как и /api/public/tip/run/[id] (соседний роут).

import { NextRequest, NextResponse } from "next/server"
import { getOrCreateTipUser } from "@/lib/tip/session"
import { getRunForUser } from "@/lib/tip/service"
import { getRunStats } from "@/lib/tip/analytics"

export const runtime = "nodejs"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const user = await getOrCreateTipUser()

  const run = await getRunForUser(user.id, id)
  if (!run) {
    return NextResponse.json({ error: "Разбор не найден" }, { status: 404 })
  }

  const stats = await getRunStats(run.id)
  return NextResponse.json(stats)
}
