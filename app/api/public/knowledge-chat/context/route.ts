import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies } from "@/lib/db/schema"
import { verifyToken } from "../auth/route"
import { buildPublicChatContext } from "@/lib/knowledge/public-chat-context"
import { checkRateLimit } from "@/lib/rate-limit"

export async function POST(req: NextRequest) {
  let body: { token?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Невалидный JSON" }, { status: 400 })
  }

  if (!body.token) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 })
  }

  const payload = verifyToken(body.token)
  if (!payload || !payload.companyId) {
    return NextResponse.json({ error: "Сессия истекла" }, { status: 401 })
  }

  const companyId = payload.companyId

  // Rate-limit по companyId: не более 30 запросов/мин (как у соседнего /answer).
  // Предотвращает неограниченное выкачивание базы знаний по токену (security P2).
  if (!checkRateLimit(`public-ask-ctx:${companyId}`, 30, 60_000)) {
    return NextResponse.json({ error: "Слишком много запросов, попробуйте через минуту" }, { status: 429 })
  }

  const [companyRow] = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1)
  if (!companyRow) {
    return NextResponse.json({ error: "Компания не найдена" }, { status: 404 })
  }

  const { context, materialsList } = await buildPublicChatContext(companyId)

  // Ключ Claude браузеру НЕ отдаём — ответы генерирует серверный
  // /api/public/knowledge-chat/answer.
  return NextResponse.json({
    context,
    materialsList,
    companyName: companyRow.name,
  })
}
