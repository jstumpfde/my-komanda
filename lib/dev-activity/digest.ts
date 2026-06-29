// Ежедневная выжимка dev-активности в Telegram.
//
// Шлётся раз в сутки после порога (20:00 МСК) из крона /api/cron/dev-activity.
// Защита от повторов — запись в cron_runs (cronName 'dev-activity-digest' за
// сегодня): если уже слали сегодня — пропускаем. Бот и чат — из env
// (TELEGRAM_DEV_ACTIVITY_BOT_TOKEN / TELEGRAM_DEV_ACTIVITY_CHAT_ID); если не
// заданы — тихо ничего не делаем.

import { and, eq, gte } from "drizzle-orm"
import { db } from "@/lib/db"
import { cronRuns } from "@/lib/db/schema"
import { startCronRun, finishCronRun } from "@/lib/cron/record-run"
import { getAllSeries, type DevActivitySeries } from "./store"

const DIGEST_CRON = "dev-activity-digest"
const SEND_AFTER_MSK_HOUR = 20          // не слать раньше 20:00 МСК
const DAILY_NORM_HOURS = 8
const WEEKLY_NORM_HOURS = 40
const UNDER_RATIO = 0.7, OVER_RATIO = 1.3

function mskDayStr(): string {
  return new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10)
}
function mskHour(): number {
  return new Date(Date.now() + 3 * 3600_000).getUTCHours()
}

function verdictEmoji(hours: number, commits: number): string {
  if (commits <= 0 || hours <= 0) return "🔇 тишина"
  if (hours < UNDER_RATIO * DAILY_NORM_HOURS) return "🔴 ниже нормы"
  if (hours > OVER_RATIO * DAILY_NORM_HOURS) return "🔵 выше нормы"
  return "🟢 норма"
}

function fmtH(min: number): string {
  const h = Math.round((min / 60) * 10) / 10
  return `${h}ч`
}

export function buildDigestText(series: DevActivitySeries[], dayStr: string): string {
  const [, m, d] = dayStr.split("-")
  const lines: string[] = [`📊 Dev-активность · выжимка за ${d}.${m}`, ""]

  for (const s of series) {
    const today = s.days.length ? s.days[s.days.length - 1] : null
    const last7 = s.days.slice(-7)
    const weekMin = last7.reduce((a, x) => a + (x.workMinutes ?? 0), 0)
    const weekDays = last7.filter(x => x.commitCount > 0).length
    const hours = (today?.workMinutes ?? 0) / 60
    const verdict = verdictEmoji(hours, today?.commitCount ?? 0)

    lines.push(`${verdict.split(" ")[0]} ${s.label.toUpperCase()} (${s.person})`)
    lines.push(`Сегодня: ${verdict.split(" ").slice(1).join(" ")} · ≈${Math.round(hours * 10) / 10}ч из ${DAILY_NORM_HOURS}ч · задач ${today?.taskCount ?? 0}`)
    lines.push(`Неделя: ≈${fmtH(weekMin)} / ${WEEKLY_NORM_HOURS}ч · активных дней ${weekDays}/7`)
    if (today?.summary) lines.push(`└ ${today.summary}`)
    lines.push("")
  }

  lines.push("Подробно: company24.pro/admin/dev-activity")
  return lines.join("\n")
}

async function sendTelegram(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_DEV_ACTIVITY_BOT_TOKEN
  const chat = process.env.TELEGRAM_DEV_ACTIVITY_CHAT_ID
  if (!token || !chat) return false
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
    })
    return res.ok
  } catch {
    return false
  }
}

// Лучшая попытка: вызвать после сбора в крон-роуте. Сама решает, время ли слать
// и не слали ли уже сегодня. Никогда не бросает (best-effort).
export async function maybeSendDailyDigest(): Promise<{ sent: boolean; reason?: string }> {
  try {
    if (!process.env.TELEGRAM_DEV_ACTIVITY_BOT_TOKEN || !process.env.TELEGRAM_DEV_ACTIVITY_CHAT_ID) {
      return { sent: false, reason: "no telegram env" }
    }
    if (mskHour() < SEND_AFTER_MSK_HOUR) return { sent: false, reason: "too early" }

    const dayStr = mskDayStr()
    const cutoff = new Date(`${dayStr}T00:00:00+03:00`)
    const [already] = await db.select({ id: cronRuns.id }).from(cronRuns)
      .where(and(eq(cronRuns.cronName, DIGEST_CRON), gte(cronRuns.startedAt, cutoff))).limit(1)
    if (already) return { sent: false, reason: "already sent today" }

    const run = await startCronRun(DIGEST_CRON).catch(() => null)
    const series = await getAllSeries()
    const ok = await sendTelegram(buildDigestText(series, dayStr))
    if (run) await finishCronRun(run.id, ok ? "ok" : "error", { sent: ok })
    return { sent: ok, reason: ok ? undefined : "telegram send failed" }
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : String(err) }
  }
}
