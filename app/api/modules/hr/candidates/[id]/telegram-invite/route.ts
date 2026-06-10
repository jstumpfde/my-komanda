// app/api/modules/hr/candidates/[id]/telegram-invite/route.ts
// F7: генерация / получение deep-link приглашения в Telegram для кандидата.
// POST — генерирует токен (если нет) и возвращает ссылку.

import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, companies, vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { generateInviteToken, buildCandidateDeepLink } from "@/lib/telegram/candidate-bot"

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    // Проверить что кандидат принадлежит компании + взять его поля
    const [row] = await db
      .select({
        id:                  candidates.id,
        telegramInviteToken: candidates.telegramInviteToken,
        telegramChatId:      candidates.telegramChatId,
        telegramOptOut:      candidates.telegramOptOut,
        telegramUsername:    candidates.telegramUsername,
      })
      .from(candidates)
      .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
      .where(and(
        eq(candidates.id, id),
        eq(vacancies.companyId, user.companyId),
      ))
      .limit(1)

    if (!row) return apiError("Кандидат не найден", 404)

    // Токен бота
    const [company] = await db
      .select({
        candidateBotToken:    companies.candidateBotToken,
        candidateBotUsername: companies.candidateBotUsername,
      })
      .from(companies)
      .where(eq(companies.id, user.companyId))
      .limit(1)

    if (!company?.candidateBotToken || !company?.candidateBotUsername) {
      return apiError("Telegram-бот не подключён. Настройте бота в разделе Интеграции.", 400)
    }

    // Генерируем invite-токен если его ещё нет
    let inviteToken = row.telegramInviteToken
    if (!inviteToken) {
      inviteToken = generateInviteToken()
      await db.update(candidates)
        .set({ telegramInviteToken: inviteToken, updatedAt: new Date() })
        .where(eq(candidates.id, id))
    }

    const deepLink = buildCandidateDeepLink(company.candidateBotUsername, inviteToken)

    return apiSuccess({
      deepLink,
      inviteToken,
      connected:   !!row.telegramChatId,
      optOut:      row.telegramOptOut ?? false,
      username:    row.telegramUsername ?? null,
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[POST /candidates/[id]/telegram-invite]", err)
    return apiError("Internal server error", 500)
  }
}
