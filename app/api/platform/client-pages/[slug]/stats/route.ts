// GET /api/platform/client-pages/[slug]/stats — сводка аналитики по сайту
// витрины для кабинета админа. Доступ: платформенный оператор.

import { NextRequest, NextResponse } from "next/server"
import { requirePlatformOperator } from "@/lib/platform/auth"
import { isValidSlug } from "@/lib/platform/client-pages"
import { getStats } from "@/lib/platform/client-pages-analytics"

export const dynamic = "force-dynamic"

export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  try {
    await requirePlatformOperator()
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { slug } = await ctx.params
  if (!isValidSlug(slug)) return NextResponse.json({ error: "bad slug" }, { status: 400 })
  try {
    const stats = await getStats(slug)
    return NextResponse.json(stats)
  } catch (err) {
    console.error("[platform/client-pages/:slug/stats GET]", err)
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
