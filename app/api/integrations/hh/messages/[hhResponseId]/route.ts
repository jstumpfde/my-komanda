import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { hhResponses } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { getValidToken } from "@/lib/hh-helpers"

interface HhMessageItem {
  id?: string
  text?: string | null
  body?: string | null
  content?: string | null
  message?: string | null
  author_type?: "applicant" | "employer" | string
  author?: { participant_type?: string; type?: string; id?: string | number }
  created_at?: string
  viewed_by_me?: boolean
  viewed_by_opponent?: boolean
  state?: { id?: string; name?: string }
  parts?: Array<{ text?: string; body?: string }>
}

interface NormalizedMessage {
  id: string
  text: string
  authorType: string
  createdAt: string | null
  viewedByMe: boolean
  viewedByOpponent: boolean
}

function extractText(m: HhMessageItem): string {
  // Прямые текстовые поля
  const direct = [m.text, m.body, m.content, m.message].find(
    (v) => typeof v === "string" && v.trim().length > 0,
  )
  if (typeof direct === "string") return direct
  // Сборное сообщение из частей
  if (Array.isArray(m.parts)) {
    const joined = m.parts
      .map((p) => p?.text ?? p?.body ?? "")
      .filter((s) => typeof s === "string" && s.trim().length > 0)
      .join("\n")
    if (joined.trim()) return joined
  }
  return ""
}

function extractAuthorType(m: HhMessageItem): string {
  return (
    m.author_type ??
    m.author?.participant_type ??
    m.author?.type ??
    "unknown"
  )
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ hhResponseId: string }> }) {
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

  // with_text=true критично — без него hh иногда возвращает только метаданные.
  const url = `https://api.hh.ru/negotiations/${hhResponseId}/messages?with_text=true`

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
      items?: HhMessageItem[]
      found?: number
    }

    if (process.env.NODE_ENV !== "production") {
      console.log("[hh/messages] items count:", data.items?.length ?? 0)
      if (data.items?.[0]) {
        console.log("[hh/messages] first item dump:", JSON.stringify(data.items[0]).slice(0, 800))
      }
    }

    const messages: NormalizedMessage[] = (data.items ?? [])
      .filter((m): m is HhMessageItem & { id: string } => typeof m?.id === "string")
      .map((m) => ({
        id: m.id,
        text: extractText(m),
        authorType: extractAuthorType(m),
        createdAt: m.created_at ?? null,
        viewedByMe: m.viewed_by_me ?? false,
        viewedByOpponent: m.viewed_by_opponent ?? false,
      }))

    // Cover letter (первое сообщение кандидата) лежит в самом negotiation,
    // не в /messages. Подмешиваем его как синтетический "applicant"-меседж,
    // если его ещё нет в списке.
    const raw = resp.rawData as Record<string, unknown> | null
    const letterRaw = raw && typeof raw === "object"
      ? (raw["letter"] ?? raw["cover_letter"] ?? null)
      : null
    const letterText = typeof letterRaw === "string"
      ? letterRaw.trim()
      : (letterRaw && typeof letterRaw === "object" && typeof (letterRaw as { text?: unknown }).text === "string"
        ? ((letterRaw as { text: string }).text).trim()
        : "")
    if (letterText) {
      const alreadyHas = messages.some(m => m.authorType === "applicant" && m.text === letterText)
      if (!alreadyHas) {
        const createdAt = (raw && typeof (raw as { created_at?: string }).created_at === "string")
          ? (raw as { created_at: string }).created_at
          : null
        messages.unshift({
          id: `cover-${hhResponseId}`,
          text: letterText,
          authorType: "applicant",
          createdAt,
          viewedByMe: true,
          viewedByOpponent: true,
        })
      }
    }

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
