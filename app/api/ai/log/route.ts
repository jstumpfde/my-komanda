import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { aiUsageLog } from "@/lib/db/schema"
import { requireCompany } from "@/lib/api-helpers"

// Claude Sonnet pricing (USD per 1M tokens)
const PRICE_INPUT_PER_MTOK = 3
const PRICE_OUTPUT_PER_MTOK = 15

export async function POST(req: NextRequest) {
  let user
  try {
    user = await requireCompany()
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: {
    action?: string
    inputTokens?: number
    outputTokens?: number
    model?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Невалидный JSON" }, { status: 400 })
  }

  const action = (body.action || "").trim()
  const model = (body.model || "").trim()
  const inputTokens = Math.max(0, Math.floor(Number(body.inputTokens) || 0))
  const outputTokens = Math.max(0, Math.floor(Number(body.outputTokens) || 0))

  if (!action) {
    return NextResponse.json({ error: "action обязателен" }, { status: 400 })
  }

  const costUsd = (
    (inputTokens * PRICE_INPUT_PER_MTOK) / 1_000_000 +
    (outputTokens * PRICE_OUTPUT_PER_MTOK) / 1_000_000
  ).toFixed(6)

  try {
    const [row] = await db
      .insert(aiUsageLog)
      .values({
        tenantId: user.companyId,
        userId: user.id,
        action,
        inputTokens,
        outputTokens,
        model: model || null,
        costUsd,
      })
      .returning()

    return NextResponse.json({ ok: true, id: row.id, costUsd })
  } catch (err) {
    console.error("[ai/log POST]", err)
    return NextResponse.json({ error: "Ошибка записи в лог" }, { status: 500 })
  }
}
