// app/api/modules/hr/candidates/[id]/telegram-send/route.ts
// F7: отправка сообщения кандидату через Telegram-бот компании.
// POST { message: string }

import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, companies, vacancies } from "@/lib/db/schema"
import type { TgMessage } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { tgSendMessage } from "@/lib/telegram/candidate-bot"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const body = await req.json().catch(() => ({})) as { message?: string }
    const text = typeof body.message === "string" ? body.message.trim() : ""
    if (!text) return apiError("Сообщение не может быть пустым", 400)
    if (text.length > 4096) return apiError("Сообщение слишком длинное (максимум 4096 символов)", 400)

    // Проверить что кандидат принадлежит компании
    const [row] = await db
      .select({
        id:              candidates.id,
        name:            candidates.name,
        telegramChatId:  candidates.telegramChatId,
        telegramOptOut:  candidates.telegramOptOut,
        tgMessages:      candidates.tgMessages,
      })
      .from(candidates)
      .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
      .where(and(
        eq(candidates.id, id),
        eq(vacancies.companyId, user.companyId),
      ))
      .limit(1)

    if (!row) return apiError("Кандидат не найден", 404)

    if (!row.telegramChatId) {
      return apiError("Кандидат ещё не подключил Telegram. Отправьте ему ссылку-приглашение.", 400)
    }

    if (row.telegramOptOut) {
      return apiError("Кандидат отписался от Telegram-уведомлений (/stop).", 400)
    }

    // Токен бота компании
    const [company] = await db
      .select({ candidateBotToken: companies.candidateBotToken })
      .from(companies)
      .where(eq(companies.id, user.companyId))
      .limit(1)

    if (!company?.candidateBotToken) {
      return apiError("Telegram-бот не подключён. Настройте бота в разделе Интеграции.", 400)
    }

    // Отправить сообщение — без дополнительной задержки для одиночной отправки
    const sent = await tgSendMessage(company.candidateBotToken, row.telegramChatId, text)
    if (!sent) {
      return apiError("Не удалось отправить сообщение через Telegram. Проверьте подключение бота.", 502)
    }

    // Сохранить в историю
    const newMsg: TgMessage = {
      role:   "hr",
      text,
      sentAt: new Date().toISOString(),
    }
    const current = Array.isArray(row.tgMessages) ? row.tgMessages : []
    const updated = [...current, newMsg].slice(-500)

    await db.update(candidates)
      .set({ tgMessages: updated, updatedAt: new Date() })
      .where(eq(candidates.id, id))

    return apiSuccess({ sent: true })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[POST /candidates/[id]/telegram-send]", err)
    return apiError("Internal server error", 500)
  }
}
