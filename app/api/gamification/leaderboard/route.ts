import { NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { getLeaderboard } from "@/lib/gamification/points"

export async function GET() {
  let user: { companyId: string }
  try { user = await requireCompany() } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  const rows = await getLeaderboard(user.companyId, 10)
  return NextResponse.json(rows)
}
