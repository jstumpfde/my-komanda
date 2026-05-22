"use server"

// Group 14 — server actions для /admin/platform UI.
// Все мутации проходят через email-whitelist (PLATFORM_ADMIN_EMAILS), даже
// при наличии валидной сессии. /api/platform/* эндпоинты использовать
// напрямую из браузера нельзя — там X-Platform-Admin-Key, а ключа в
// клиентском бандле быть не должно.

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { platformFunnelTemplates, vacancies } from "@/lib/db/schema"
import { isPlatformAdminEmail } from "@/lib/platform/auth"
import { runPendingMigrations } from "@/lib/platform/settings-migrations"
import {
  emergencyKillAllAiChatbots,
  emergencyRestoreAllAiChatbots,
  emergencyAddGlobalStopWord,
  emergencyRegenerateAllAiPrompts,
  recordEmergencyAction,
} from "@/lib/platform/emergency-broadcast"
import { normalizeFunnelConfig } from "@/lib/funnel-builder/blocks"

async function requireAdminEmail(): Promise<string> {
  const session = await auth()
  const email = session?.user?.email
  if (!isPlatformAdminEmail(email)) {
    throw new Error("Forbidden")
  }
  return email!
}

export async function actionRunMigrations() {
  const email = await requireAdminEmail()
  const report = await runPendingMigrations(email)
  revalidatePath("/admin/platform")
  return report
}

export async function actionKillAllChatbots() {
  const email = await requireAdminEmail()
  const result = await emergencyKillAllAiChatbots()
  await recordEmergencyAction("kill_all_ai_chatbots", null, result, email)
  revalidatePath("/admin/platform")
  return result
}

export async function actionRestoreAllChatbots() {
  const email = await requireAdminEmail()
  const result = await emergencyRestoreAllAiChatbots()
  await recordEmergencyAction("restore_all_ai_chatbots", null, result, email)
  revalidatePath("/admin/platform")
  return result
}

export async function actionAddGlobalStopWord(word: string) {
  const email = await requireAdminEmail()
  const trimmed = (word ?? "").trim()
  if (!trimmed) throw new Error("word required")
  const result = await emergencyAddGlobalStopWord(trimmed)
  await recordEmergencyAction("add_global_stop_word", { word: trimmed }, result, email)
  revalidatePath("/admin/platform")
  return result
}

export async function actionRegenerateAiPrompts() {
  const email = await requireAdminEmail()
  const result = await emergencyRegenerateAllAiPrompts()
  await recordEmergencyAction("regenerate_ai_prompts", null, result, email)
  revalidatePath("/admin/platform")
  return result
}

// ─── Group 16: Platform funnel templates ─────────────────────────────────────

export interface PlatformTemplateInput {
  name:         string
  description?: string | null
  industry?:    string | null
  configJson?:  unknown
  isPublished?: boolean
}

function validateTemplateInput(input: PlatformTemplateInput) {
  const name = (input.name ?? "").trim()
  if (!name) throw new Error("name обязателен")
  if (name.length > 200) throw new Error("name слишком длинный (max 200)")
  return { name }
}

export async function actionMineTemplateFromVacancy(input: {
  sourceVacancyId: string
  name:            string
  description?:    string | null
  industry?:       string | null
  isPublished?:    boolean
}) {
  await requireAdminEmail()
  const { name } = validateTemplateInput(input)
  if (!input.sourceVacancyId) throw new Error("sourceVacancyId обязателен")

  const [vac] = await db.select({
    id:               vacancies.id,
    companyId:        vacancies.companyId,
    funnelConfigJson: vacancies.funnelConfigJson,
  })
    .from(vacancies)
    .where(eq(vacancies.id, input.sourceVacancyId))
    .limit(1)
  if (!vac) throw new Error("Вакансия не найдена")

  const configJson = normalizeFunnelConfig(vac.funnelConfigJson)
  const [row] = await db.insert(platformFunnelTemplates).values({
    name,
    description:     input.description ?? null,
    industry:        input.industry ?? null,
    configJson,
    sourceVacancyId: vac.id,
    sourceCompanyId: vac.companyId,
    isPublished:     input.isPublished === true,
  }).returning()

  revalidatePath("/admin/platform")
  return row
}

export async function actionUpdatePlatformTemplate(id: string, input: Partial<PlatformTemplateInput>) {
  await requireAdminEmail()
  const updates: Record<string, unknown> = { updatedAt: new Date() }
  if (typeof input.name === "string") {
    const { name } = validateTemplateInput({ name: input.name })
    updates.name = name
  }
  if (input.description !== undefined) updates.description = input.description ?? null
  if (input.industry !== undefined) updates.industry = input.industry ?? null
  if (input.configJson !== undefined) {
    const rawCfg = input.configJson && typeof input.configJson === "object"
      ? input.configJson
      : { blocks: Array.isArray(input.configJson) ? input.configJson : [] }
    updates.configJson = normalizeFunnelConfig(rawCfg)
  }
  if (typeof input.isPublished === "boolean") updates.isPublished = input.isPublished

  const [updated] = await db.update(platformFunnelTemplates)
    .set(updates)
    .where(eq(platformFunnelTemplates.id, id))
    .returning()
  if (!updated) throw new Error("Шаблон не найден")
  revalidatePath("/admin/platform")
  return updated
}

export async function actionDeletePlatformTemplate(id: string) {
  await requireAdminEmail()
  const [deleted] = await db.delete(platformFunnelTemplates)
    .where(eq(platformFunnelTemplates.id, id))
    .returning({ id: platformFunnelTemplates.id })
  if (!deleted) throw new Error("Шаблон не найден")
  revalidatePath("/admin/platform")
  return { ok: true }
}
