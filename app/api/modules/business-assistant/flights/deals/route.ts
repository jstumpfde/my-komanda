import { NextRequest, NextResponse } from "next/server"
import { desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { flightDeals } from "@/lib/db/schema"
import { requireCompany } from "@/lib/api-helpers"

export async function GET(req: NextRequest) {
  try {
    await requireCompany()
  } catch (res) {
    return res as Response
  }

  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") ?? "1"))
  const pageSize = 20

  const deals = await db
    .select()
    .from(flightDeals)
    .orderBy(desc(flightDeals.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  return NextResponse.json({ deals })
}
