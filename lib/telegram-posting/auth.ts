// Трёхшаговый вход в личный Telegram-аккаунт владельца платформы (userbot,
// MTProto/GramJS) БЕЗ интерактивного input() — каждый шаг дергается отдельным
// API-роутом из UI:
//   1) startLogin(userId, phone)     — отправляет код в Telegram
//   2) confirmCode(userId, code)     — подтверждает код (или просит пароль 2FA)
//   3) confirmPassword(userId, pass) — подтверждает пароль облачного 2FA
//
// СЕРВЕРНЫЙ модуль — не импортировать из client components.

import { eq } from "drizzle-orm"
import { Api } from "telegram"
import { computeCheck } from "telegram/Password"
import { db } from "@/lib/db"
import { telegramUserbotSessions } from "@/lib/db/schema"
import { createEmptySessionClient, createClientFromSessionString, getApiCredentials } from "./client"
import { encryptSessionString, decryptSessionString } from "./crypto"

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

async function upsertSession(userId: string, patch: Partial<typeof telegramUserbotSessions.$inferInsert>) {
  const [existing] = await db
    .select({ id: telegramUserbotSessions.id })
    .from(telegramUserbotSessions)
    .where(eq(telegramUserbotSessions.userId, userId))
    .limit(1)

  if (existing) {
    await db
      .update(telegramUserbotSessions)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(telegramUserbotSessions.userId, userId))
  } else {
    await db.insert(telegramUserbotSessions).values({ userId, ...patch })
  }
}

async function getRow(userId: string) {
  const [row] = await db
    .select()
    .from(telegramUserbotSessions)
    .where(eq(telegramUserbotSessions.userId, userId))
    .limit(1)
  return row ?? null
}

/** Шаг 1: отправить код подтверждения на телефон. */
export async function startLogin(userId: string, phone: string): Promise<{ ok: true }> {
  const { apiId, apiHash } = getApiCredentials()
  const client = createEmptySessionClient()
  try {
    await client.connect()
    const result = await client.sendCode({ apiId, apiHash }, phone)
    // ВАЖНО: сохраняем сессию СРАЗУ после connect+sendCode (ещё не залогинена,
    // но уже содержит auth key) — без неё confirmCode не сможет продолжить тот
    // же MTProto-контекст.
    const sessionString = client.session.save() as unknown as string
    await upsertSession(userId, {
      phone,
      sessionString: encryptSessionString(sessionString),
      phoneCodeHash: result.phoneCodeHash,
      status: "pending_code",
      lastError: null,
    })
    return { ok: true }
  } catch (err) {
    await upsertSession(userId, { status: "error", lastError: errMessage(err) })
    throw err
  } finally {
    await client.disconnect().catch(() => {})
  }
}

/** Шаг 2: подтвердить код из Telegram. Если нужен 2FA — вернёт need2fa=true. */
export async function confirmCode(
  userId: string,
  code: string
): Promise<{ ok: true; need2fa: boolean }> {
  const row = await getRow(userId)
  if (!row || !row.sessionString || !row.phone || !row.phoneCodeHash) {
    throw new Error("Нет начатого входа — сначала запросите код (шаг 1)")
  }

  const sessionString = decryptSessionString(row.sessionString)
  const client = createClientFromSessionString(sessionString)
  try {
    await client.connect()
    try {
      await client.invoke(
        new Api.auth.SignIn({
          phoneNumber: row.phone,
          phoneCodeHash: row.phoneCodeHash,
          phoneCode: code,
        })
      )
      // Успех без 2FA — сохраняем УЖЕ залогиненную сессию.
      const finalSession = client.session.save() as unknown as string
      await upsertSession(userId, {
        sessionString: encryptSessionString(finalSession),
        phoneCodeHash: null,
        status: "active",
        lastError: null,
        lastConnectedAt: new Date(),
      })
      return { ok: true, need2fa: false }
    } catch (err) {
      const msg = errMessage(err)
      if (msg.includes("SESSION_PASSWORD_NEEDED")) {
        // Пароль облачного 2FA нужен — сохраняем текущую (уже с проверенным
        // кодом) сессию, чтобы шаг 3 мог продолжить тот же auth-контекст.
        const midSession = client.session.save() as unknown as string
        await upsertSession(userId, {
          sessionString: encryptSessionString(midSession),
          status: "pending_password",
          lastError: null,
        })
        return { ok: true, need2fa: true }
      }
      await upsertSession(userId, { status: "error", lastError: msg })
      throw err
    }
  } finally {
    await client.disconnect().catch(() => {})
  }
}

/** Шаг 3: подтвердить пароль облачного 2FA. Пароль НЕ сохраняется. */
export async function confirmPassword(userId: string, password: string): Promise<{ ok: true }> {
  const row = await getRow(userId)
  if (!row || !row.sessionString) {
    throw new Error("Нет начатого входа — сначала запросите код (шаг 1)")
  }

  const sessionString = decryptSessionString(row.sessionString)
  const client = createClientFromSessionString(sessionString)
  try {
    await client.connect()
    const passwordSrpResult = await client.invoke(new Api.account.GetPassword())
    const passwordSrpCheck = await computeCheck(passwordSrpResult, password)
    await client.invoke(new Api.auth.CheckPassword({ password: passwordSrpCheck }))

    const finalSession = client.session.save() as unknown as string
    await upsertSession(userId, {
      sessionString: encryptSessionString(finalSession),
      phoneCodeHash: null,
      status: "active",
      lastError: null,
      lastConnectedAt: new Date(),
    })
    return { ok: true }
  } catch (err) {
    await upsertSession(userId, { status: "error", lastError: errMessage(err) })
    throw err
  } finally {
    await client.disconnect().catch(() => {})
  }
}

/** Разлогин: удаляет ряд сессии (не пытается вызвать LogOut в Telegram — просто забываем локально). */
export async function disconnectAccount(userId: string): Promise<void> {
  await db.delete(telegramUserbotSessions).where(eq(telegramUserbotSessions.userId, userId))
}
