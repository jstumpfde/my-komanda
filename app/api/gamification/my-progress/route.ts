import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getEmployeeProgress } from "@/lib/gamification/points"

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const employeeId = searchParams.get("employeeId") ?? session.user.id

  const progress = await getEmployeeProgress(session.user.companyId, employeeId)
  if (!progress) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json(progress)
}
