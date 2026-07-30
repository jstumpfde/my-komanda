// GET/POST /api/cron/ai-rop-billing
//
// Раз в сутки: 1) runAutoRenewals() — начисляет токены тарифа компаниям с
// autoRenew=true, у которых истёк оплаченный период, и сдвигает period на
// месяц; 2) уведомления о балансе/окончании периода (email через
// lib/email/smtp.ts) компаниям с включённым settings.tokenBilling.notifyEnabled —
// получатели: notifyEmails ИЛИ директора компании (role director/client),
// письмо от noreply.
//
// Дедупликация — таблица rop_billing_reminders (tenantId, kind, mark), unique:
//   kind='period_ending', mark='{periodEnd}_{N}d' — за N=[7,5,3,2,1] дней до
//     конца периода (mark включает periodEnd, чтобы не заблокировать напоминание
//     в СЛЕДУЮЩЕМ цикле после автопродления);
//   kind='low_balance',   mark='{понедельник этой недели}' — не чаще раза в
//     неделю, пока баланс остаётся ≤ lowThreshold.
//
// Защищён X-Cron-Secret. Рекомендуемое расписание (раз в сутки, 04:00 МСК):
//   0 1 * * * curl -s -X POST -H "X-Cron-Secret: $CRON_SECRET" \
//     https://company24.pro/api/cron/ai-rop-billing \
//     >> /var/log/ai-rop-billing.log 2>&1
import { NextRequest, NextResponse } from "next/server"
import { and, eq, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies, ropBillingReminders, ropSettings, users } from "@/lib/db/schema"
import { checkCronAuth } from "@/lib/cron/auth"
import { startCronRun, finishCronRun } from "@/lib/cron/record-run"
import { getSettingsJson } from "@/lib/ai-rop/settings"
import { getBillingStatus, getTokenSettings, runAutoRenewals, REMINDER_DAYS_BEFORE } from "@/lib/ai-rop/tokens"
import { sendEmail } from "@/lib/email/smtp"

export const maxDuration = 120

const CRON_NAME = "ai-rop-billing"
const DIRECTOR_ROLES = ["director", "client"]

function mondayOf(d: Date): string {
  const x = new Date(d)
  const day = x.getDay()
  const diff = day === 0 ? 6 : day - 1
  x.setDate(x.getDate() - diff)
  return x.toISOString().slice(0, 10)
}

async function ownerEmails(companyId: string): Promise<string[]> {
  const rows = await db
    .select({ email: users.email })
    .from(users)
    .where(and(eq(users.companyId, companyId), inArray(users.role, DIRECTOR_ROLES), eq(users.isActive, true)))
  return rows.map((r) => r.email).filter(Boolean)
}

/** Атомарно резервирует (tenantId, kind, mark) — true, если строка реально вставлена (шлём письмо). */
async function reserveReminder(tenantId: string, kind: string, mark: string): Promise<boolean> {
  const inserted = await db
    .insert(ropBillingReminders)
    .values({ tenantId, kind, mark })
    .onConflictDoNothing()
    .returning({ id: ropBillingReminders.id })
  return inserted.length > 0
}

async function handle(req: NextRequest) {
  const auth = checkCronAuth(req)
  if (!auth.ok) return auth.response

  const run = await startCronRun(CRON_NAME).catch(() => null)

  let renewedCount = 0
  let renewErrors = 0
  let notified = 0
  let notifyErrors = 0

  try {
    const renewals = await runAutoRenewals()
    renewedCount = renewals.renewed.length
    renewErrors = renewals.errors.length
    for (const e of renewals.errors) console.warn(`[cron/${CRON_NAME}] auto-renew ${e.companyId}:`, e.error)

    const settingsRows = await db.select().from(ropSettings)
    const monday = mondayOf(new Date())

    for (const row of settingsRows) {
      const json = getSettingsJson(row)
      const tb = json.tokenBilling
      if (!tb?.notifyEnabled) continue

      try {
        const [tokenSettings, status, company] = await Promise.all([
          getTokenSettings(row.companyId),
          getBillingStatus(row.companyId),
          db.select({ name: companies.name }).from(companies).where(eq(companies.id, row.companyId)).limit(1),
        ])

        let recipients = tokenSettings.notifyEmails
        if (recipients.length === 0) recipients = await ownerEmails(row.companyId)
        if (recipients.length === 0) continue

        const companyName = company[0]?.name?.trim() || "компания"

        if (status.low) {
          const reserved = await reserveReminder(row.companyId, "low_balance", monday)
          if (reserved) {
            for (const to of recipients) {
              const res = await sendEmail({
                to,
                subject: `AI-РОП: низкий баланс токенов — ${companyName}`,
                html: `<p>Баланс AI-РОП компании «${companyName}» — <b>${status.balance}</b> токенов (порог ${status.lowThreshold}).</p>` +
                  (status.enforce ? `<p><b>Внимание:</b> обработка звонков остановится при балансе ≤ 0.</p>` : ``) +
                  `<p>Пополните баланс в настройках AI-РОП.</p>`,
              })
              if (res.ok) notified++
              else notifyErrors++
            }
          }
        }

        if (status.periodEnd && status.daysUntilPeriodEnd !== null && REMINDER_DAYS_BEFORE.includes(status.daysUntilPeriodEnd)) {
          const mark = `${status.periodEnd}_${status.daysUntilPeriodEnd}d`
          const reserved = await reserveReminder(row.companyId, "period_ending", mark)
          if (reserved) {
            for (const to of recipients) {
              const res = await sendEmail({
                to,
                subject: `AI-РОП: оплаченный период заканчивается через ${status.daysUntilPeriodEnd} дн. — ${companyName}`,
                html: `<p>Оплаченный период AI-РОП компании «${companyName}» заканчивается ${status.periodEnd} (через ${status.daysUntilPeriodEnd} дн.).</p>` +
                  `<p>Текущий баланс: <b>${status.balance}</b> токенов.</p>`,
              })
              if (res.ok) notified++
              else notifyErrors++
            }
          }
        }
      } catch (e) {
        notifyErrors++
        console.error(`[cron/${CRON_NAME}] notify company ${row.companyId}:`, (e as Error).message)
      }
    }

    const result = { renewedCount, renewErrors, notified, notifyErrors }
    if (run) await finishCronRun(run.id, "ok", result)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[cron/${CRON_NAME}]`, err)
    if (run) await finishCronRun(run.id, "error", { renewedCount, renewErrors, notified, notifyErrors }, message)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return handle(req)
}

export async function POST(req: NextRequest) {
  return handle(req)
}
