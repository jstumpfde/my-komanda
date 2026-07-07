// lib/tip/bot/sessions.ts
// Хранилище состояния мастера диалога Telegram-бота «Типология»
// (tip_tg_sessions, миграция 0262 — см. lib/db/schema.ts → tipTgSessions).

import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { tipTgSessions, type TipTgSession, type TipTgSessionData } from "@/lib/db/schema"
import type { BotState } from "@/lib/tip/bot/flow"

export async function getSession(chatId: number): Promise<TipTgSession | null> {
  const [row] = await db.select().from(tipTgSessions).where(eq(tipTgSessions.chatId, chatId)).limit(1)
  return row ?? null
}

/** Upsert состояния диалога. state='idle' сбрасывает мастер (см. resetSession). */
export async function setSession(chatId: number, state: BotState, data: TipTgSessionData): Promise<void> {
  await db
    .insert(tipTgSessions)
    .values({ chatId, state, dataJson: data, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: tipTgSessions.chatId,
      set: { state, dataJson: data, updatedAt: new Date() },
    })
}

/** Сбрасывает мастер в idle, сохраняя lastUpdateId (dedupe) и черновик даты рождения. */
export async function resetSession(chatId: number, keepBirthDate?: string): Promise<void> {
  const existing = await getSession(chatId)
  await setSession(chatId, "idle", {
    lastUpdateId: existing?.dataJson?.lastUpdateId,
    shortMessagesCount: existing?.dataJson?.shortMessagesCount,
    draft: keepBirthDate ? { birthDate: keepBirthDate } : undefined,
  })
}

/**
 * Dedupe повторных апдейтов Telegram (ретраи webhook при таймауте нашего
 * ответа). Возвращает true, если update_id уже обработан — вызывающий код
 * должен молча ответить 200 и ничего не делать.
 */
export async function isDuplicateUpdate(chatId: number, updateId: number): Promise<boolean> {
  const existing = await getSession(chatId)
  if (existing?.dataJson?.lastUpdateId === updateId) return true
  return false
}

export async function markUpdateProcessed(chatId: number, updateId: number): Promise<void> {
  const existing = await getSession(chatId)
  const state = (existing?.state ?? "idle") as BotState
  await setSession(chatId, state, {
    ...(existing?.dataJson ?? {}),
    lastUpdateId: updateId,
  })
}
