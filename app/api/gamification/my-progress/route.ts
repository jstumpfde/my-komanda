import { NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { getEmployeeProgress } from "@/lib/gamification/points"

export async function GET(req: Request) {
  let user: { id: string; companyId: string }
  try { user = await requireCompany() } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  const { searchParams } = new URL(req.url)
  const employeeId = searchParams.get("employeeId") ?? user.id

  const progress = await getEmployeeProgress(user.companyId, employeeId)
  if (!progress) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json(progress)
}
