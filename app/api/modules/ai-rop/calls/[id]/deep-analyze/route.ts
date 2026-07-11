// POST /api/modules/ai-rop/calls/[id]/deep-analyze — переанализ транскрипта другой
// моделью (не трогает STT/скачивание — только AI-разбор поверх уже сохранённого текста).
// Body: { model?: string } — необязательное переопределение модели.
// Доступ: requireRopManage (директор) — платный AI-вызов.
import { NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropAnalyses, ropCalls, ropSalesScripts, ropTranscripts, type NewRopAnalysis } from "@/lib/db/schema"
import { apiError } from "@/lib/api-helpers"
import { requireRopManage } from "@/lib/ai-rop/access"
import { analyzeCall } from "@/lib/ai-rop/analyzer"
import type { ChecklistItem } from "@/lib/ai-rop/types"

export const maxDuration = 300

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRopManage()
    const { id } = await ctx.params
    if (!id) return apiError("id обязателен", 400)

    let modelOverride: string | undefined
    try {
      const body = await req.json().catch(() => ({}))
      if (body?.model && typeof body.model === "string") modelOverride = body.model
    } catch {
      // без тела — используем дефолт rop_settings.analysisModel внутри analyzeCall
    }

    const [call] = await db
      .select()
      .from(ropCalls)
      .where(and(eq(ropCalls.id, id), eq(ropCalls.tenantId, user.companyId)))
      .limit(1)
    if (!call) return apiError("Звонок не найден", 404)

    const [transcript] = await db.select().from(ropTranscripts).where(eq(ropTranscripts.callId, id)).limit(1)
    if (!transcript?.text) return apiError("Транскрипт не найден — сначала обработайте звонок", 422)

    let checklist: ChecklistItem[] | null = null
    try {
      const scripts = await db
        .select({ checklistJson: ropSalesScripts.checklistJson, product: ropSalesScripts.product })
        .from(ropSalesScripts)
        .where(and(eq(ropSalesScripts.tenantId, user.companyId), eq(ropSalesScripts.isActive, true)))
      const match =
        (call.detectedProduct && scripts.find((s) => s.product === call.detectedProduct)) ||
        scripts.find((s) => !s.product) ||
        scripts[0]
      if (match?.checklistJson && Array.isArray(match.checklistJson) && (match.checklistJson as unknown[]).length > 0) {
        checklist = match.checklistJson as ChecklistItem[]
      }
    } catch {
      // чек-лист опционален — работаем без него
    }

    const context = (call.dealContextJson as Parameters<typeof analyzeCall>[0]["context"]) ?? null
    const interactionType = (call.interactionType ?? "call") as "call" | "chat" | "email" | "meeting"

    const { analysis, raw, model } = await analyzeCall({
      transcript: transcript.text,
      checklist,
      context,
      companyId: user.companyId,
      callId: id,
      interactionType,
      modelOverride,
    })

    const values: Omit<NewRopAnalysis, "callId" | "createdAt"> = {
      summary: analysis.summary,
      sentiment: analysis.sentiment,
      managerScore: analysis.manager_score,
      scriptCompliance: analysis.checklist_compliance,
      nextAction: analysis.next_action,
      objectionsJson: analysis.objections ?? [],
      topicsJson: analysis.topics ?? [],
      checklistScoresJson: analysis.checklist_scores ?? [],
      clientName: analysis.client_name ?? null,
      detectedProduct: call.detectedProduct,
      rawJson: safeParseJson(raw),
      model,
      coachingTipsJson: analysis.coaching_tips ?? [],
      callStage: analysis.call_stage ?? "cold",
      ropNotesJson: analysis.rop_notes ?? [],
      callbackAgreed: analysis.callback_agreed ?? false,
      callbackPhrase: analysis.callback_agreed ? analysis.callback_phrase ?? null : null,
    }
    await db
      .insert(ropAnalyses)
      .values({ callId: id, ...values })
      .onConflictDoUpdate({ target: ropAnalyses.callId, set: { ...values, createdAt: new Date() } })

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/calls/:id/deep-analyze] error:", err)
    return apiError("Internal server error", 500)
  }
}

function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}
