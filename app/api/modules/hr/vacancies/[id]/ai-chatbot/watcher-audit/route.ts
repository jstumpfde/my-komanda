// #69 Manual trigger AI-наблюдателя: HR может запустить аудит компании
// прямо из UI вакансии (кнопка "Запустить аудит сейчас").
// Аудит сам по себе компанейский (не вакансиевый), но точка входа
// удобнее на странице вакансии.

import { NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { runWatcherAudit } from "@/lib/ai/chatbot-watcher"

export async function POST() {
  try {
    const user = await requireCompany()
    const result = await runWatcherAudit(user.companyId)
    return NextResponse.json({
      ok:         true,
      sampleSize: result.sampleSize,
      issues:     result.issues,
      summary:    result.summary,
      ranAt:      new Date().toISOString(),
    })
  } catch (e) {
    if (e instanceof Response) return e
    const msg = e instanceof Error ? e.message : "internal"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
