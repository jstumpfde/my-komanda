import { NextRequest, NextResponse } from "next/server"
import { eq, and, inArray, lt, isNull, lte } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies, candidates, companies, followUpMessages, followUpCampaigns, hhResponses } from "@/lib/db/schema"
import { sendMail } from "@/lib/mail"
import { getValidToken } from "@/lib/hh-helpers"
import { shouldStopFollowUp } from "@/lib/followup/should-stop"
import { canSendNow } from "@/lib/working-hours"
import { checkCronAuth } from "@/lib/cron/auth"

// POST /api/cron/follow-up
// Отправляет одно повторное сообщение кандидатам в статусе new/awaiting_response старше 48 часов.
// Protected by X-Cron-Secret header — см. checkCronAuth в lib/cron/auth.ts.
export async function POST(req: NextRequest) {
  const auth = checkCronAuth(req)
  if (!auth.ok) return auth.response

  const now = new Date()
  const threshold = new Date(now.getTime() - 48 * 60 * 60 * 1000) // 48 часов назад
  let sent = 0
  let skipped = 0

  try {
    // Кандидаты в статусе new, созданные более 48 часов назад.
    // v5: автоматизация пропускается, если AI-классификатор поставил automationPaused
    // (например, кандидат уже отказался или попросил личный контакт).
    const stale = await db
      .select()
      .from(candidates)
      .where(and(
        inArray(candidates.stage, ["new"]),
        lt(candidates.createdAt, threshold),
        eq(candidates.automationPaused, false),
      ))

    for (const candidate of stale) {
      // Проверяем follow_up_sent в demoProgressJson (используем как общий json-store)
      const progressJson = candidate.demoProgressJson as Record<string, unknown> | null
      if (progressJson?.follow_up_sent) {
        skipped++
        continue
      }

      if (!candidate.email) {
        skipped++
        continue
      }

      // Загружаем вакансию и компанию
      const [vacancy] = await db
        .select()
        .from(vacancies)
        .where(eq(vacancies.id, candidate.vacancyId))
        .limit(1)

      if (!vacancy || vacancy.status === "closed" || vacancy.deletedAt) {
        skipped++
        continue
      }

      const [company] = await db
        .select({ name: companies.name })
        .from(companies)
        .where(eq(companies.id, vacancy.companyId))
        .limit(1)

      // Проверка рабочих часов вакансии. Если сейчас вне окна — НЕ помечаем
      // как failed, просто пропускаем. Следующий cron в рабочее время подберёт.
      if (!canSendNow(vacancy, now)) {
        skipped++
        continue
      }

      const candidateToken = candidate.token || candidate.id
      const firstName = candidate.name.split(" ")[0]
      const link = `${process.env.NEXTAUTH_URL || "https://mycomanda24.ru"}/candidate/${candidateToken}`

      const text = `${firstName}, добрый день! Вчера отправляли вам обзор должности ${vacancy.title}. Может, не дошло? Вот ссылка: ${link} — займёт всего 15 мин :)`

      try {
        await sendMail({
          to: candidate.email,
          subject: `Напоминание: ${vacancy.title} — ${company?.name || "Моя Команда"}`,
          text,
        })

        // Помечаем follow_up_sent = true
        await db
          .update(candidates)
          .set({
            demoProgressJson: { ...(progressJson || {}), follow_up_sent: true },
            updatedAt: now,
          })
          .where(eq(candidates.id, candidate.id))

        sent++
      } catch (mailErr) {
        console.error(`[cron/follow-up] Failed to send to ${candidate.email}:`, mailErr)
        skipped++
      }
    }

    // ───── Воронка дожима (TZ-5/4): касания follow_up_messages ─────
    const campaignResult = await processCampaignTouches(now)

    return NextResponse.json({
      ok: true,
      processed: stale.length,
      sent,
      skipped,
      campaign: campaignResult,
      ts: now.toISOString(),
    })
  } catch (err) {
    console.error("[cron/follow-up]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// ─── Воронка дожима: обработка касаний follow_up_messages ─────────────────
// Берём до 50 pending-касаний, у которых scheduled_at <= NOW().
// Для каждого: проверяем стоп-триггеры → отправляем через hh negotiations
// messages → пишем sentAt + status. При ошибке — status=failed + errorMessage.

async function processCampaignTouches(now: Date) {
  const pending = await db
    .select()
    .from(followUpMessages)
    .where(and(eq(followUpMessages.status, "pending"), lte(followUpMessages.scheduledAt, now)))
    .limit(50)

  let touchSent = 0
  let touchCancelled = 0
  let touchFailed = 0

  for (const msg of pending) {
    // Стоп-триггеры (вакансия закрыта / демо пройдено / отказ / автоматизация остановлена)
    const stopResult = await shouldStopFollowUp(msg.candidateId, msg.campaignId)
    if (stopResult.stop) {
      await db.update(followUpMessages).set({
        status: "cancelled",
        errorMessage: stopResult.reason ?? "stopped",
      }).where(eq(followUpMessages.id, msg.id))
      touchCancelled++
      continue
    }

    // Ищем привязанный hh-отклик и токен компании
    const [campaign] = await db
      .select({ vacancyId: followUpCampaigns.vacancyId })
      .from(followUpCampaigns)
      .where(eq(followUpCampaigns.id, msg.campaignId))
      .limit(1)
    if (!campaign) {
      await db.update(followUpMessages).set({ status: "cancelled", errorMessage: "campaign_missing" }).where(eq(followUpMessages.id, msg.id))
      touchCancelled++
      continue
    }

    const [vacancy] = await db
      .select({ companyId: vacancies.companyId, title: vacancies.title })
      .from(vacancies)
      .where(eq(vacancies.id, campaign.vacancyId))
      .limit(1)
    if (!vacancy) {
      await db.update(followUpMessages).set({ status: "cancelled", errorMessage: "vacancy_missing" }).where(eq(followUpMessages.id, msg.id))
      touchCancelled++
      continue
    }

    const [hhResp] = await db
      .select({ hhResponseId: hhResponses.hhResponseId })
      .from(hhResponses)
      .where(eq(hhResponses.localCandidateId, msg.candidateId))
      .limit(1)
    if (!hhResp) {
      await db.update(followUpMessages).set({ status: "failed", errorMessage: "no_hh_response_link" }).where(eq(followUpMessages.id, msg.id))
      touchFailed++
      continue
    }

    const tokenResult = await getValidToken(vacancy.companyId)
    if (!tokenResult) {
      await db.update(followUpMessages).set({ status: "failed", errorMessage: "no_hh_token" }).where(eq(followUpMessages.id, msg.id))
      touchFailed++
      continue
    }

    // Подставляем переменные в текст касания (имя из кандидата, должность, ссылка)
    const [cand] = await db
      .select({ name: candidates.name, shortId: candidates.shortId, token: candidates.token })
      .from(candidates)
      .where(eq(candidates.id, msg.candidateId))
      .limit(1)
    const firstName = (cand?.name ?? "").trim().split(/\s+/)[0] || "Здравствуйте"
    const tokenForUrl = cand?.shortId ?? cand?.token ?? msg.candidateId
    const demoUrl = `https://company24.pro/demo/${tokenForUrl}`
    const finalText = msg.messageText
      .replaceAll("{Имя}", firstName).replaceAll("{имя}", firstName)
      .replaceAll("[Имя]", firstName).replaceAll("[имя]", firstName)
      .replaceAll("{должность}", vacancy.title || "").replaceAll("[должность]", vacancy.title || "")
      .replaceAll("{компания}", "Company24").replaceAll("[компания]", "Company24")
      .replaceAll("{ссылка}", demoUrl).replaceAll("[ссылка]", demoUrl)

    try {
      const form = new URLSearchParams()
      form.set("message", finalText)
      const res = await fetch(`https://api.hh.ru/negotiations/${hhResp.hhResponseId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenResult.accessToken}`,
          "User-Agent": "Company24.pro/1.0",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form.toString(),
      })
      if (!res.ok) {
        const errText = await res.text()
        await db.update(followUpMessages).set({
          status: "failed",
          errorMessage: `hh_${res.status}: ${errText.slice(0, 200)}`,
        }).where(eq(followUpMessages.id, msg.id))
        touchFailed++
        continue
      }
      await db.update(followUpMessages).set({
        status: "sent",
        sentAt: new Date(),
      }).where(eq(followUpMessages.id, msg.id))
      touchSent++
    } catch (err) {
      await db.update(followUpMessages).set({
        status: "failed",
        errorMessage: err instanceof Error ? err.message.slice(0, 200) : "unknown",
      }).where(eq(followUpMessages.id, msg.id))
      touchFailed++
    }
  }

  return { processed: pending.length, sent: touchSent, cancelled: touchCancelled, failed: touchFailed }
}
