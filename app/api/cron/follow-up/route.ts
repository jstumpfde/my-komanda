import { NextRequest, NextResponse } from "next/server"
import { eq, and, inArray, lt, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies, candidates, companies } from "@/lib/db/schema"
import { sendMail } from "@/lib/mail"

// POST /api/cron/follow-up
// Отправляет одно повторное сообщение кандидатам в статусе new/awaiting_response старше 48 часов
// Protected by X-Cron-Secret header
export async function POST(req: NextRequest) {
  const secret = req.headers.get("X-Cron-Secret")
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

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

      // Читаем настройки автоматизации
      const descJson = vacancy.descriptionJson as Record<string, unknown> | null
      const automation = descJson?.automation as Record<string, unknown> | undefined

      // Проверяем рабочие часы
      const wh = automation?.workingHours as { enabled: boolean; from: string; to: string } | undefined
      if (wh?.enabled) {
        const hours = now.getHours()
        const minutes = now.getMinutes()
        const current = hours * 60 + minutes
        const [fH, fM] = (wh.from || "09:00").split(":").map(Number)
        const [tH, tM] = (wh.to || "20:00").split(":").map(Number)
        if (current < fH * 60 + fM || current > tH * 60 + tM) {
          skipped++
          continue
        }
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

    return NextResponse.json({
      ok: true,
      processed: stale.length,
      sent,
      skipped,
      ts: now.toISOString(),
    })
  } catch (err) {
    console.error("[cron/follow-up]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
