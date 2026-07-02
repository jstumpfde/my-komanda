import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates } from "@/lib/db/schema"
import { apiError, apiSuccess } from "@/lib/api-helpers"
import { isShortId } from "@/lib/short-id"
import { checkPublicTokenRateLimit } from "@/lib/public/rate-limit-public"

// POST /api/public/demo/[token]/cta-click
// Публичный (без логина) трекинг клика по кнопке-ссылке (button-блок с
// buttonTarget="url") на финальном/любом экране демо. Вызывается через
// navigator.sendBeacon ПЕРЕД уходом кандидата на внешний URL.
//
// Хранение: demo_progress_json.ctaClicks — массив { blockId, at } (без дублей
// по blockId). Прочитать «перешёл ли» = ctaClicks.length > 0. НЕ инкрементирует
// разбор/скоринг, НЕ двигает стадию воронки. Миграция не нужна — пишем в
// существующую jsonb-колонку.
//
// Body: { blockId: string }
// sendBeacon шлёт Blob с type "application/json", поэтому Content-Type может
// быть application/json — читаем тело максимально терпимо.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    // Анти-перебор предсказуемых short_id (см. lib/public/rate-limit-public).
    if (!checkPublicTokenRateLimit(req, "demo-cta-click")) {
      return apiError("Слишком много запросов, попробуйте позже", 429)
    }

    const { token } = await params

    let blockId = ""
    try {
      const body = await req.json()
      if (body && typeof body.blockId === "string") blockId = body.blockId
    } catch {
      // sendBeacon иногда шлёт text/plain — пробуем как текст.
      try {
        const txt = await req.text()
        const parsed = JSON.parse(txt)
        if (parsed && typeof parsed.blockId === "string") blockId = parsed.blockId
      } catch { /* ignore */ }
    }
    if (!blockId) return apiError("blockId обязателен", 400)

    const idRows = await db
      .select({ id: candidates.id })
      .from(candidates)
      .where(isShortId(token) ? eq(candidates.shortId, token) : eq(candidates.token, token))
      .limit(1)
    if (idRows.length === 0) return apiError("Кандидат не найден", 404)
    const candidateId = idRows[0].id

    const now = new Date().toISOString()

    await db.transaction(async (tx) => {
      const [row] = await tx
        .select({ demoProgressJson: candidates.demoProgressJson })
        .from(candidates)
        .where(eq(candidates.id, candidateId))
        .for("update")
        .limit(1)
      if (!row) return

      const prev = (row.demoProgressJson as Record<string, unknown> | null) || {}
      const prevClicks = Array.isArray(prev.ctaClicks)
        ? (prev.ctaClicks as Array<{ blockId?: string; at?: string }>)
        : []
      // Без дублей по blockId — повторный клик не плодит записи.
      const filtered = prevClicks.filter((c) => c?.blockId !== blockId)
      const ctaClicks = [...filtered, { blockId, at: now }]

      await tx
        .update(candidates)
        .set({
          demoProgressJson: { ...prev, ctaClicks, lastUpdated: now },
          lastActivityAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(candidates.id, candidateId))
    })

    return apiSuccess({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("POST /api/public/demo/[token]/cta-click", err)
    return apiError("Internal server error", 500)
  }
}
