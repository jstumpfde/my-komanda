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
import { asc } from "drizzle-orm"
import { platformFunnelTemplates, vacancies, yuliaMessages } from "@/lib/db/schema"
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
import {
  setPlatformSetting,
  getFaviconUrls,
  getPublicSeoDefaults,
  PLATFORM_TITLE_KEY,
  PLATFORM_DESCRIPTION_KEY,
  PLATFORM_OG_IMAGE_KEY,
  FAVICON_URLS_KEY,
  FAVICON_URLS_DEFAULT,
  PUBLIC_SEO_DEFAULTS_KEY,
} from "@/lib/platform/settings"

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

// ─── Брендинг и SEO (Group Branding) ────────────────────────────────────────

export async function actionUpdatePlatformBranding(input: {
  title:       string
  description: string
  ogImage?:    string | null
}) {
  await requireAdminEmail()
  const title = (input.title ?? "").trim()
  if (!title) throw new Error("Заголовок не может быть пустым")
  if (title.length > 200) throw new Error("Заголовок слишком длинный (макс 200)")
  const description = (input.description ?? "").trim()
  if (description.length > 500) throw new Error("Описание слишком длинное (макс 500)")
  const ogImage = (input.ogImage ?? "").trim() || null

  await setPlatformSetting(PLATFORM_TITLE_KEY, title)
  await setPlatformSetting(PLATFORM_DESCRIPTION_KEY, description)
  await setPlatformSetting(PLATFORM_OG_IMAGE_KEY, ogImage)

  revalidatePath("/")
  revalidatePath("/admin/platform")
  return { ok: true }
}

export async function actionUpdatePlatformFavicon(input: {
  light?: string | null
  dark?:  string | null
  svg?:   string | null
  apple?: string | null
}) {
  await requireAdminEmail()
  // Читаем текущие значения, чтобы не затирать незаданные поля
  const current = await getFaviconUrls()

  const updated = {
    light: (typeof input.light === "string" && input.light.trim()) ? input.light.trim() : current.light,
    dark:  (typeof input.dark  === "string" && input.dark.trim())  ? input.dark.trim()  : current.dark,
    svg:   (typeof input.svg   === "string" && input.svg.trim())   ? input.svg.trim()   : current.svg,
    apple: (typeof input.apple === "string" && input.apple.trim()) ? input.apple.trim() : current.apple,
  }

  // Сброс к дефолту: если все пустые строки переданы явно как ""
  const allReset =
    input.light === "" && input.dark === "" && input.svg === "" && input.apple === ""
  if (allReset) {
    await setPlatformSetting(FAVICON_URLS_KEY, FAVICON_URLS_DEFAULT)
  } else {
    await setPlatformSetting(FAVICON_URLS_KEY, updated)
  }

  revalidatePath("/")
  revalidatePath("/admin/platform")
  return { ok: true, urls: allReset ? FAVICON_URLS_DEFAULT : updated }
}

export async function actionUpdatePublicSeoDefaults(input: {
  ogImage?:               string | null
  careersTitleSuffix?:    string
  vacancyTitleTemplate?:  string
}) {
  await requireAdminEmail()
  const current = await getPublicSeoDefaults()

  const updated = {
    ogImage: input.ogImage !== undefined
      ? ((input.ogImage ?? "").trim() || null)
      : current.ogImage,
    careersTitleSuffix: (typeof input.careersTitleSuffix === "string" && input.careersTitleSuffix.trim())
      ? input.careersTitleSuffix.trim()
      : current.careersTitleSuffix,
    vacancyTitleTemplate: (typeof input.vacancyTitleTemplate === "string" && input.vacancyTitleTemplate.trim())
      ? input.vacancyTitleTemplate.trim()
      : current.vacancyTitleTemplate,
  }

  await setPlatformSetting(PUBLIC_SEO_DEFAULTS_KEY, updated)
  revalidatePath("/admin/platform")
  return { ok: true, defaults: updated }
}

// Группа 28: чтение полной истории сообщений конкретного диалога Юлии для
// просмотра в platform admin. Возвращает только то, что нужно для UI —
// без полей вроде pending_action.params (могут быть громоздкими).
export async function actionGetYuliaConversation(conversationId: string) {
  await requireAdminEmail()
  const messages = await db
    .select({
      id:            yuliaMessages.id,
      role:          yuliaMessages.role,
      content:       yuliaMessages.content,
      pendingAction: yuliaMessages.pendingAction,
      actionStatus:  yuliaMessages.actionStatus,
      createdAt:     yuliaMessages.createdAt,
    })
    .from(yuliaMessages)
    .where(eq(yuliaMessages.conversationId, conversationId))
    .orderBy(asc(yuliaMessages.createdAt))
  return {
    messages: messages.map(m => ({
      id:             m.id,
      role:           m.role,
      content:        m.content,
      pending_action: m.pendingAction,
      action_status:  m.actionStatus,
      created_at:     m.createdAt ? m.createdAt.toISOString() : null,
    })),
  }
}
