// Funnel Builder MVP: GET/PUT конфигурации конструктора воронки.
// Принцип «двойной записи»: при сохранении дополнительно обновляются старые
// поля совместимости (aiChatbotEnabled, aiProcessSettings.followupEnabled),
// чтобы cron'ы и старые компоненты, которые читают эти поля, видели
// корректное состояние воронки. См. drizzle/0127_funnel_builder.sql.

import { NextRequest, NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
import { requireCompany } from "@/lib/api-helpers"
import {
  normalizeFunnelConfig,
  validateFunnelConfig,
  type FunnelBlock,
  type FunnelBlockType,
} from "@/lib/funnel-builder/blocks"

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompany()
    const { id } = await ctx.params
    const [row] = await db
      .select({
        funnelBuilderEnabled: vacancies.funnelBuilderEnabled,
        funnelConfigJson:     vacancies.funnelConfigJson,
      })
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)
    if (!row) return NextResponse.json({ error: "not found" }, { status: 404 })
    return NextResponse.json({
      funnelBuilderEnabled: row.funnelBuilderEnabled,
      funnelConfigJson:     normalizeFunnelConfig(row.funnelConfigJson),
    })
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompany()
    const { id } = await ctx.params
    const body = await req.json().catch(() => ({})) as {
      funnelBuilderEnabled?: unknown
      blocks?: unknown
    }

    // Загружаем текущую вакансию — нужно для дополнения недостающих блоков
    // и для двойной записи в aiProcessSettings.
    const [current] = await db
      .select({
        funnelConfigJson:  vacancies.funnelConfigJson,
        aiProcessSettings: vacancies.aiProcessSettings,
        descriptionJson:   vacancies.descriptionJson,
      })
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)
    if (!current) return NextResponse.json({ error: "not found" }, { status: 404 })

    const updates: Record<string, unknown> = { updatedAt: new Date() }

    if (typeof body.funnelBuilderEnabled === "boolean") {
      updates.funnelBuilderEnabled = body.funnelBuilderEnabled
    }

    let nextConfig = normalizeFunnelConfig(current.funnelConfigJson)
    if (Array.isArray(body.blocks)) {
      nextConfig = normalizeFunnelConfig({ blocks: body.blocks })
      const err = validateFunnelConfig(nextConfig)
      if (err) return NextResponse.json({ error: err }, { status: 400 })
      updates.funnelConfigJson = nextConfig

      // ── Двойная запись в старые поля совместимости ──────────────────
      // Цель: HR использует конструктор, но cron'ы и старые UI продолжают
      // читать legacy-поля (aiChatbotEnabled, aiScoringEnabled,
      // aiProcessSettings.*). Поэтому каждое изменение блока зеркалим
      // в соответствующий legacy-источник.
      //
      // Маппинг блоков → legacy-полей (hard = колонка таблицы,
      // soft = ключ внутри aiProcessSettings JSON, без cron-эффекта):
      //   ai_chatbot           → vacancies.aiChatbotEnabled   (hard)
      //   ai_resume_score      → vacancies.aiScoringEnabled   (hard)
      //   dozhim               → aiProcessSettings.followupEnabled       (soft)
      //   prequalification     → aiProcessSettings.prequalEnabled        (soft)
      //   ai_anketa_score      → aiProcessSettings.aiAnketaScoreEnabled  (soft)
      //   auto_reply_test_task → aiProcessSettings.testTaskAutoReplyEnabled (soft)
      //   stop_words_chat      → aiProcessSettings.stopWordsChatEnabled  (soft)
      //   stop_factors_resume  → aiProcessSettings.stopFactorsEnabled    (soft)
      //   first_message        → aiProcessSettings.firstMessageEnabled   (soft, required = всегда true)
      //   interview            → aiProcessSettings.interviewEnabled      (soft)
      //   thank_you_screen     → aiProcessSettings.thankYouScreenEnabled (soft)
      //   recovery             → vacancies.recoveryMessageEnabled        (hard, см. ниже)
      //   call_intent          → descriptionJson.automation.callIntent.enabled (nested, см. ниже)
      //   demo / anketa        — required, источника правды как такового
      //                          нет: всегда включены, не зеркалим.
      //   test_quiz            — состояние в таблице demos, не зеркалим.
      const findBlock = (t: FunnelBlockType): FunnelBlock | undefined =>
        nextConfig.blocks.find(b => b.type === t)
      const enabledOf = (t: FunnelBlockType): boolean | undefined => findBlock(t)?.enabled

      // Hard-колонки.
      const aiChatbot = enabledOf("ai_chatbot")
      if (aiChatbot !== undefined) updates.aiChatbotEnabled = aiChatbot

      const aiResumeScore = enabledOf("ai_resume_score")
      if (aiResumeScore !== undefined) updates.aiScoringEnabled = aiResumeScore

      // Soft-флаги внутри aiProcessSettings. Сохраняем все существующие
      // ключи (...prev), не падаем если объект пустой или не объект.
      const prev = (current.aiProcessSettings && typeof current.aiProcessSettings === "object")
        ? current.aiProcessSettings as Record<string, unknown>
        : {}
      const softMap: Array<[FunnelBlockType, string]> = [
        ["dozhim",               "followupEnabled"],
        ["prequalification",     "prequalEnabled"],
        ["ai_anketa_score",      "aiAnketaScoreEnabled"],
        ["auto_reply_test_task", "testTaskAutoReplyEnabled"],
        ["stop_words_chat",      "stopWordsChatEnabled"],
        ["stop_factors_resume",  "stopFactorsEnabled"],
        ["first_message",        "firstMessageEnabled"],
        ["interview",            "interviewEnabled"],
        ["thank_you_screen",     "thankYouScreenEnabled"],
      ]
      const softUpdates: Record<string, unknown> = {}
      for (const [blockType, key] of softMap) {
        const v = enabledOf(blockType)
        if (v !== undefined) softUpdates[key] = v
      }
      if (Object.keys(softUpdates).length > 0) {
        updates.aiProcessSettings = { ...prev, ...softUpdates }
      }

      // ── Блоки T2–T4, хранящие enabled НЕ в aiProcessSettings ────────────
      // recovery → vacancies.recoveryMessageEnabled (hard-колонка, читает
      //   рантайм process-queue). call_intent → descriptionJson.automation.
      //   callIntent.enabled (вложенный jsonb, читает scan-incoming).
      // test_quiz НЕ зеркалим: состояние теста живёт в таблице demos
      //   (kind='test'), простого boolean-флага на вакансии нет.
      const recovery = enabledOf("recovery")
      if (recovery !== undefined) updates.recoveryMessageEnabled = recovery

      const callIntent = enabledOf("call_intent")
      if (callIntent !== undefined) {
        const desc = (current.descriptionJson && typeof current.descriptionJson === "object")
          ? current.descriptionJson as Record<string, unknown>
          : {}
        const automation = (desc.automation && typeof desc.automation === "object")
          ? desc.automation as Record<string, unknown>
          : {}
        const ci = (automation.callIntent && typeof automation.callIntent === "object")
          ? automation.callIntent as Record<string, unknown>
          : {}
        updates.descriptionJson = {
          ...desc,
          automation: { ...automation, callIntent: { ...ci, enabled: callIntent } },
        }
      }
    }

    const [r] = await db.update(vacancies)
      .set(updates)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .returning({ id: vacancies.id })
    if (!r) return NextResponse.json({ error: "not found" }, { status: 404 })
    return NextResponse.json({
      ok:                   true,
      funnelConfigJson:     nextConfig,
    })
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
