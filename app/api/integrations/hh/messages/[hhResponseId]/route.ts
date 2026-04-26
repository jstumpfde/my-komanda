import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { hhResponses } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { getValidToken } from "@/lib/hh-helpers"

export async function GET(req: NextRequest, { params }: { params: Promise<{ hhResponseId: string }> }) {
  const session = await auth()
  if (!session?.user?.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { hhResponseId } = await params
  const companyId = session.user.companyId

  const [resp] = await db
    .select()
    .from(hhResponses)
    .where(and(eq(hhResponses.companyId, companyId), eq(hhResponses.hhResponseId, hhResponseId)))
    .limit(1)

  if (!resp) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const tokenResult = await getValidToken(companyId)
  if (!tokenResult) return NextResponse.json({ error: "hh не подключён" }, { status: 400 })

  const url = `https://api.hh.ru/negotiations/${hhResponseId}/messages`

  try {
    const hhRes = await fetch(url, {
      headers: {
        Authorization: `Bearer ${tokenResult.accessToken}`,
        "User-Agent": "Company24.pro/1.0",
      },
    })

    if (!hhRes.ok) {
      const errText = await hhRes.text()
      console.error("[hh/messages] hh returned", hhRes.status, errText)
      return NextResponse.json({ error: `hh API error: ${hhRes.status}`, details: errText }, { status: hhRes.status })
    }

    const data = await hhRes.json() as {
      items?: Array<{
        id: string
        text?: string
        author_type?: "applicant" | "employer"
        author?: { participant_type?: string }
        created_at?: string
        viewed_by_me?: boolean
        viewed_by_opponent?: boolean
      }>
      found?: number
    }

    const messages = (data.items ?? []).map(m => ({
      id: m.id,
      text: m.text ?? "",
      authorType: m.author_type ?? m.author?.participant_type ?? "unknown",
      createdAt: m.created_at ?? null,
      viewedByMe: m.viewed_by_me ?? false,
      viewedByOpponent: m.viewed_by_opponent ?? false,
    }))

    return NextResponse.json({
      messages,
      total: data.found ?? messages.length,
      candidateName: resp.candidateName,
    })
  } catch (err) {
    console.error("[hh/messages] fetch failed", err instanceof Error ? err.message : err)
    return NextResponse.json({ error: "Не удалось получить переписку из hh" }, { status: 500 })
  }
}
