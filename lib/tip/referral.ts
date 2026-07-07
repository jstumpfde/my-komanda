// Реферальная механика «Подари разбор» модуля «Типология».
//
// Все параметры (сколько прогонов дарим приглашённому, сколько бонусом
// рефереру, месячный кап на анти-фрод) — из tip_settings, НЕ хардкод.
//
// Поток:
//  1) Владелец получает свой код через ensureRefCode() (лениво создаётся
//     при первом обращении к GET /api/public/tip/me/ref).
//  2) Новый посетитель приходит по ссылке /tip?ref=<код> → UI дергает
//     POST /api/public/tip/ref { code } → attachReferral() один раз
//     привязывает referred_by, создаёт tip_referrals(status=pending) и
//     сразу начисляет приглашённому "welcome"-прогоны (чтобы было чем
//     попробовать продукт).
//  3) Координатор вызывает processReferralActivation(userId) СРАЗУ ПОСЛЕ
//     первого завершённого (status=done) прогона этого userId — это и
//     есть точка интеграции, которую координатор вставляет в
//     lib/tip/service.ts (runGeneration, ветка success) ИЛИ в роут
//     GET /api/public/tip/run/[id] при обнаружении первого done. Активация
//     переводит referral в status=activated и начисляет рефереру бонусные
//     прогоны — но не больше referral_monthly_cap бонусов за последние 30
//     дней (считаем по количеству bonus_granted_at рефералов этого реферера
//     за окно, не по сумме прогонов).

import { randomBytes } from "crypto"
import { and, eq, gte, isNull, isNotNull, count, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { tipUsers, tipReferrals, tipSettings, tipRuns } from "@/lib/db/schema"

// Антифрод (0263): не больше N welcome-начислений на один ip_hash за 30 дней —
// защита от фарма (регистрация десятков "приглашённых" с одного устройства
// через инкогнито/очистку cookie).
const WELCOME_IP_CAP_PER_30D = 2

const REF_CODE_LENGTH = 8
// Без 0/O/1/I — визуально неотличимые символы, чтобы код был легко продиктовать/перепечатать.
const REF_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

function randomRefCode(): string {
  const bytes = randomBytes(REF_CODE_LENGTH)
  let out = ""
  for (let i = 0; i < REF_CODE_LENGTH; i++) {
    out += REF_CODE_ALPHABET[bytes[i]! % REF_CODE_ALPHABET.length]
  }
  return out
}

async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const [row] = await db.select().from(tipSettings).where(eq(tipSettings.key, key)).limit(1)
  if (row?.valueJson === undefined || row.valueJson === null) return fallback
  return row.valueJson as T
}

/**
 * Возвращает реферальный код пользователя, создавая его при первом обращении.
 * Ретраи при коллизии unique-констрейнта (крайне маловероятно на 8 симв. из
 * 58-символьного алфавита, но код должен быть корректен всегда).
 */
export async function ensureRefCode(userId: string): Promise<string> {
  const [user] = await db.select().from(tipUsers).where(eq(tipUsers.id, userId)).limit(1)
  if (!user) throw new Error(`tip_users не найден: ${userId}`)
  if (user.refCode) return user.refCode

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomRefCode()
    const updated = await db
      .update(tipUsers)
      .set({ refCode: code })
      .where(and(eq(tipUsers.id, userId), isNull(tipUsers.refCode)))
      .returning({ refCode: tipUsers.refCode })
    if (updated[0]?.refCode) return updated[0].refCode

    // Либо гонка (кто-то другой уже проставил refCode этому же userId —
    // маловероятно, но перечитываем), либо коллизия кода у другого юзера.
    const [refreshed] = await db.select().from(tipUsers).where(eq(tipUsers.id, userId)).limit(1)
    if (refreshed?.refCode) return refreshed.refCode
  }
  throw new Error("Не удалось сгенерировать уникальный ref_code за 5 попыток")
}

export interface AttachReferralResult {
  attached: boolean
  balanceRuns?: number
}

/**
 * Привязывает нового пользователя (newUserId) к рефереру по коду (refCode).
 * Молча ничего не делает (attached: false) в любом «фродовом»/некорректном
 * случае — намеренно НЕ раскрываем причину отказа наружу (см. контракт
 * POST /api/public/tip/ref в задаче координатора: тихий ответ, без ошибок).
 *
 * Правила:
 *  - у newUserId ещё не должно быть referred_by (одна привязка на всю жизнь);
 *  - код должен существовать и принадлежать ДРУГОМУ пользователю (не себе);
 *  - анти-фрод: если у обоих (реферер и приглашённый) совпадает tg_chat_id
 *    (не null) — не начислять, считаем одним и тем же человеком;
 *  - анти-фрод (0263): если у обоих совпадает ip_hash (не null) — тоже одно
 *    и то же устройство, привязку не делаем;
 *  - анти-фрод (0263): welcome-прогоны не начисляем, если за последние 30
 *    дней по ip_hash приглашённого уже было ≥ WELCOME_IP_CAP_PER_30D
 *    welcome-начислений (фарм через инкогнито/чистку cookie с одного
 *    устройства) — реферал всё равно привязывается (referred_by
 *    проставляется), просто без welcome-бонуса в этот раз.
 */
export async function attachReferral(newUserId: string, refCode: string): Promise<AttachReferralResult> {
  const code = refCode.trim()
  if (!code) return { attached: false }

  const [newUser] = await db.select().from(tipUsers).where(eq(tipUsers.id, newUserId)).limit(1)
  if (!newUser) return { attached: false }
  if (newUser.referredBy) return { attached: false } // уже привязан ранее

  const [referrer] = await db.select().from(tipUsers).where(eq(tipUsers.refCode, code)).limit(1)
  if (!referrer) return { attached: false }
  if (referrer.id === newUserId) return { attached: false } // сам себя не реферишь

  // Анти-фрод: одинаковый tg_chat_id (оба не null) — один и тот же человек.
  if (referrer.tgChatId != null && newUser.tgChatId != null && referrer.tgChatId === newUser.tgChatId) {
    return { attached: false }
  }
  // Анти-фрод (0263): одинаковый ip_hash (оба не null) — то же устройство.
  if (referrer.ipHash != null && newUser.ipHash != null && referrer.ipHash === newUser.ipHash) {
    return { attached: false }
  }

  const welcomeRuns = await getSetting("referral_welcome_runs", 1)

  // Анти-фрод (0263): welcome-кап по ip_hash приглашённого за 30 дней.
  let grantWelcome = true
  if (newUser.ipHash) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const [{ value: recentWelcomeCount }] = await db
      .select({ value: count() })
      .from(tipReferrals)
      .innerJoin(tipUsers, eq(tipUsers.id, tipReferrals.referredUserId))
      .where(
        and(
          eq(tipUsers.ipHash, newUser.ipHash),
          isNotNull(tipReferrals.welcomeGrantedAt),
          gte(tipReferrals.welcomeGrantedAt, thirtyDaysAgo),
        ),
      )
    grantWelcome = recentWelcomeCount < WELCOME_IP_CAP_PER_30D
  }

  const result = await db.transaction(async (tx) => {
    const updated = await tx
      .update(tipUsers)
      .set({
        referredBy: referrer.id,
        ...(grantWelcome ? { balanceRuns: newUser.balanceRuns + welcomeRuns } : {}),
      })
      .where(and(eq(tipUsers.id, newUserId), isNull(tipUsers.referredBy)))
      .returning({ balanceRuns: tipUsers.balanceRuns })

    if (!updated[0]) return null // гонка — кто-то уже привязал между select и update

    await tx
      .insert(tipReferrals)
      .values({
        referrerUserId: referrer.id,
        referredUserId: newUserId,
        status: "pending",
        welcomeGrantedAt: grantWelcome ? new Date() : null,
      })
      .onConflictDoNothing({ target: tipReferrals.referredUserId })

    return updated[0].balanceRuns
  })

  if (result === null) return { attached: false }
  return { attached: true, balanceRuns: result }
}

/**
 * ТОЧКА ИНТЕГРАЦИИ ДЛЯ КООРДИНАТОРА: вызывать сразу после того, как ПЕРВЫЙ
 * прогон пользователя (userId) перешёл в status='done' (т.е. пользователь
 * реально получил ценность от продукта — активация реферала не раньше этого
 * момента). Идемпотентна: если pending-реферала для этого userId нет либо
 * он уже activated — no-op.
 *
 * Анти-фрод кап: не начисляет бонус рефереру, если у него уже
 * referral_monthly_cap бонусов начислено (bonus_granted_at) за последние 30
 * дней — реферал всё равно помечается activated (статус честно отражает
 * происходящее), просто без начисления в этот раз.
 *
 * Анти-фрод (0263): бонус рефереру также не начисляется, если у реферера и
 * приглашённого совпадает ip_hash (оба не null) — одно и то же устройство.
 */
export async function processReferralActivation(userId: string): Promise<void> {
  const [referral] = await db
    .select()
    .from(tipReferrals)
    .where(and(eq(tipReferrals.referredUserId, userId), eq(tipReferrals.status, "pending")))
    .limit(1)
  if (!referral) return

  const bonusRuns = await getSetting("referral_bonus_runs", 1)
  const monthlyCap = await getSetting("referral_monthly_cap", 10)

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const [{ value: recentBonusCount }] = await db
    .select({ value: count() })
    .from(tipReferrals)
    .where(
      and(
        eq(tipReferrals.referrerUserId, referral.referrerUserId),
        eq(tipReferrals.status, "activated"),
        gte(tipReferrals.bonusGrantedAt, thirtyDaysAgo),
      ),
    )

  const [referrer] = await db.select().from(tipUsers).where(eq(tipUsers.id, referral.referrerUserId)).limit(1)
  const [referred] = await db.select().from(tipUsers).where(eq(tipUsers.id, userId)).limit(1)
  const sameDevice = !!(referrer?.ipHash && referred?.ipHash && referrer.ipHash === referred.ipHash)

  const capReached = recentBonusCount >= monthlyCap || sameDevice

  await db.transaction(async (tx) => {
    await tx
      .update(tipReferrals)
      .set({
        status: "activated",
        bonusGrantedAt: capReached ? null : new Date(),
      })
      .where(eq(tipReferrals.id, referral.id))

    if (!capReached && referrer) {
      await tx
        .update(tipUsers)
        .set({ balanceRuns: sql`${tipUsers.balanceRuns} + ${bonusRuns}` })
        .where(eq(tipUsers.id, referrer.id))
    }
  })
}

/** Утилита для координатора: есть ли у пользователя хотя бы один done-прогон. */
export async function hasAnyDoneRun(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: tipRuns.id })
    .from(tipRuns)
    .where(and(eq(tipRuns.userId, userId), eq(tipRuns.status, "done")))
    .limit(1)
  return !!row
}
