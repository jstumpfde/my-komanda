"use server"

// Group 14 — server actions для /admin/platform UI.
// Все мутации проходят через email-whitelist (PLATFORM_ADMIN_EMAILS), даже
// при наличии валидной сессии. /api/platform/* эндпоинты использовать
// напрямую из браузера нельзя — там X-Platform-Admin-Key, а ключа в
// клиентском бандле быть не должно.

import { revalidatePath } from "next/cache"
import { auth } from "@/auth"
import { isPlatformAdminEmail } from "@/lib/platform/auth"
import { runPendingMigrations } from "@/lib/platform/settings-migrations"
import {
  emergencyKillAllAiChatbots,
  emergencyRestoreAllAiChatbots,
  emergencyAddGlobalStopWord,
  emergencyRegenerateAllAiPrompts,
  recordEmergencyAction,
} from "@/lib/platform/emergency-broadcast"

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
