// #69 Cron endpoint для AI-наблюдателя.
// GET /api/cron/ai-chatbot-watcher
// Защищён X-Cron-Secret. Для каждой активной компании запускает
// runWatcherAudit; если найдены issues — внутри уже создаются notifications.
//
// Расписание: раз в час (см. README инфраструктуры).

import { NextRequest, NextResponse } from "next/server"
import { checkCronAuth } from "@/lib/cron/auth"
import { runWatcherAudit, listActiveCompaniesWithChatbot } from "@/lib/ai/chatbot-watcher"

export async function GET(req: NextRequest) {
  const auth = checkCronAuth(req)
  if (!auth.ok) return auth.response

  const companies = await listActiveCompaniesWithChatbot()
  console.log(`[cron/ai-chatbot-watcher] start companies=${companies.length}`)

  const results: Array<{ companyId: string; issues: number; sampleSize: number; summary: string }> = []
  for (const companyId of companies) {
    try {
      const r = await runWatcherAudit(companyId)
      results.push({
        companyId,
        issues:     r.issues.length,
        sampleSize: r.sampleSize,
        summary:    r.summary,
      })
    } catch (err) {
      console.warn(`[cron/ai-chatbot-watcher] company=${companyId} failed:`, err)
      results.push({ companyId, issues: 0, sampleSize: 0, summary: "error" })
    }
  }

  return NextResponse.json({ ok: true, results })
}
