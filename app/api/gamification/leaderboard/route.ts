import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getLeaderboard } from "@/lib/gamification/points"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const rows = await getLeaderboard(session.user.companyId, 10)
  return NextResponse.json(rows)
}
