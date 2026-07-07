// Бизнес-логика модуля «Типология» поверх БД: активация промокодов/бесплатных
// ссылок, создание прогона разбора (с detached-генерацией через AI) и чтение
// готовых прогонов (для владельца и по share-токену).
//
// Оплата ОТКЛЮЧЕНА на старте — доступ только через промокоды/бесплатные ссылки,
// прогоны списываются с tip_users.balance_runs.

import { randomBytes } from "crypto"
import { and, eq, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  tipUsers,
  tipRuns,
  tipPromptLayers,
  tipPromoCodes,
  tipPromoActivations,
  type TipUser,
  type TipUserPrefs,
  type TipRun,
  type TipRunInput,
} from "@/lib/db/schema"
import {
  parseBirthDate,
  computeFormula,
  computeAge,
  TipCalculationError,
} from "@/lib/tip/calculation"
import {
  buildTipPrompt,
  validateTipRequest,
  TipValidationError,
  type TipLayers,
  type TipRequestInput,
} from "@/lib/tip/prompt"
import { generateTipReport } from "@/lib/tip/generate"

// Тип транзакции Drizzle — тот же паттерн, что lib/companies/hard-delete.ts
// и lib/vacancies/hard-delete.ts (Parameters<Parameters<typeof db.transaction>[0]>[0]).
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export class TipServiceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TipServiceError"
  }
}

/** Недостаточно прогонов на балансе — API-роут маппит это на HTTP 402. */
export class TipNoBalanceError extends TipServiceError {
  constructor() {
    super("no_balance")
    this.name = "TipNoBalanceError"
  }
}

// ─── Промокоды / бесплатные ссылки ─────────────────────────────────────────

interface ActivatePromoResult {
  balanceRuns: number
  runsGranted: number
}

async function activateCodeInternal(
  userId: string,
  rawCode: string,
  requireFreeLink: boolean,
): Promise<ActivatePromoResult> {
  const code = (rawCode ?? "").trim()
  if (!code) {
    throw new TipServiceError("Промокод не найден")
  }

  return db.transaction(async (tx) => {
    // Регистронезависимый поиск + trim — сравниваем по lower(code).
    const rows = await tx.select().from(tipPromoCodes)
    const promo = rows.find(
      (p) => p.code.trim().toLowerCase() === code.toLowerCase() && (!requireFreeLink || p.isFreeLink),
    )
    if (!promo) {
      throw new TipServiceError("Промокод не найден")
    }

    if (promo.expiresAt && promo.expiresAt.getTime() < Date.now()) {
      throw new TipServiceError("Срок действия промокода истёк")
    }

    if (promo.maxActivations !== null && promo.activationsCount >= promo.maxActivations) {
      throw new TipServiceError("Лимит активаций исчерпан")
    }

    const [already] = await tx
      .select()
      .from(tipPromoActivations)
      .where(and(eq(tipPromoActivations.promoId, promo.id), eq(tipPromoActivations.userId, userId)))
      .limit(1)
    if (already) {
      throw new TipServiceError("Промокод уже использован")
    }

    await tx.insert(tipPromoActivations).values({ promoId: promo.id, userId })

    await tx
      .update(tipPromoCodes)
      .set({ activationsCount: promo.activationsCount + 1 })
      .where(eq(tipPromoCodes.id, promo.id))

    const [updatedUser] = await tx
      .update(tipUsers)
      .set({ balanceRuns: (await currentBalance(tx, userId)) + promo.runsGranted })
      .where(eq(tipUsers.id, userId))
      .returning({ balanceRuns: tipUsers.balanceRuns })

    return { balanceRuns: updatedUser?.balanceRuns ?? promo.runsGranted, runsGranted: promo.runsGranted }
  })
}

// Хелпер: текущий баланс внутри транзакции (для инкремента без гонки —
// поле маленькое, конфликт активации уже защищён unique-констрейнтом, так
// что гонка на same-user исключена; на всякий случай читаем свежее значение).
async function currentBalance(tx: Tx, userId: string): Promise<number> {
  const [row] = await tx.select({ balanceRuns: tipUsers.balanceRuns }).from(tipUsers).where(eq(tipUsers.id, userId)).limit(1)
  return row?.balanceRuns ?? 0
}

/** Активирует обычный промокод (пополняет balance_runs). Русские ошибки. */
export async function activatePromo(userId: string, code: string): Promise<ActivatePromoResult> {
  return activateCodeInternal(userId, code, false)
}

/** Активирует бесплатную ссылку (tip_promo_codes.is_free_link = true). */
export async function claimFreeLink(userId: string, token: string): Promise<ActivatePromoResult> {
  return activateCodeInternal(userId, token, true)
}

// ─── Создание прогона разбора ──────────────────────────────────────────────

export interface CreateRunInput {
  name?: string
  gender?: string
  birthDate: string
  context: string
  role?: string
  depth: string
  audience: string
  question?: string
  second?: { name?: string; birthDate: string }
  promoCode?: string
}

export interface CreateRunResult {
  runId: string
  balanceRuns: number
}

function generateShareToken(): string {
  // 24+ url-safe символов — randomBytes(18) → base64url даёт 24 символа.
  return randomBytes(18).toString("base64url")
}

/**
 * Создаёт прогон разбора: валидирует вход, проверяет баланс, списывает 1
 * прогон, сохраняет запись tip_runs (status=pending) и запускает генерацию
 * detached (не блокирует ответ клиенту). При ошибке генерации run переходит
 * в status=error и прогон возвращается пользователю на баланс.
 */
export async function createRun(user: TipUser, input: CreateRunInput): Promise<CreateRunResult> {
  // Если передан промокод — активировать ДО проверки баланса (ошибку промокода
  // возвращаем как есть, TipServiceError с русским текстом).
  if (input.promoCode?.trim()) {
    await activatePromo(user.id, input.promoCode)
  }

  // Анти-абьюз: не больше одного одновременного pending/generating прогона.
  const [active] = await db
    .select({ id: tipRuns.id })
    .from(tipRuns)
    .where(and(eq(tipRuns.userId, user.id), inArray(tipRuns.status, ["pending", "generating"])))
    .limit(1)
  if (active) {
    throw new TipServiceError("Дождитесь завершения текущего разбора")
  }

  // 1) Парсинг даты + формула + возраст — русские ошибки бросает calculation.ts.
  let birthDate: Date
  try {
    birthDate = parseBirthDate(input.birthDate)
  } catch (e) {
    if (e instanceof TipCalculationError) throw new TipServiceError(e.message)
    throw e
  }
  const formula = computeFormula(birthDate)
  const age = computeAge(birthDate)

  let secondBirthDate: Date | undefined
  let secondFormula: ReturnType<typeof computeFormula> | undefined
  let secondAge: ReturnType<typeof computeAge> | undefined
  if (input.second?.birthDate) {
    try {
      secondBirthDate = parseBirthDate(input.second.birthDate)
    } catch (e) {
      if (e instanceof TipCalculationError) throw new TipServiceError(e.message)
      throw e
    }
    secondFormula = computeFormula(secondBirthDate)
    secondAge = computeAge(secondBirthDate)
  }

  const requestInput: TipRequestInput = {
    name: input.name,
    gender: input.gender,
    birthDate: input.birthDate,
    context: input.context,
    role: input.role,
    depth: input.depth,
    audience: input.audience,
    question: input.question,
    second: input.second?.birthDate ? { name: input.second.name, birthDate: input.second.birthDate } : undefined,
  }

  try {
    validateTipRequest(requestInput, {
      isMinor: age.isMinor,
      secondIsMinor: secondAge?.isMinor,
    })
  } catch (e) {
    if (e instanceof TipValidationError) throw new TipServiceError(e.message)
    throw e
  }

  // 2) Баланс.
  if (user.balanceRuns < 1) {
    throw new TipNoBalanceError()
  }

  // 3) Транзакция: списание + insert run.
  const runInput: TipRunInput = {
    name: input.name,
    birthDate: input.birthDate,
    gender: input.gender,
    contexts: [input.context],
    role: input.role,
    extraQuestion: input.question,
    depth: input.depth as TipRunInput["depth"],
    audience: input.audience as TipRunInput["audience"],
    secondPerson: input.second ? { name: input.second.name, birthDate: input.second.birthDate } : undefined,
  }

  const shareToken = generateShareToken()

  const { runId, balanceRuns } = await db.transaction(async (tx) => {
    const [updatedUser] = await tx
      .update(tipUsers)
      .set({ balanceRuns: user.balanceRuns - 1 })
      .where(eq(tipUsers.id, user.id))
      .returning({ balanceRuns: tipUsers.balanceRuns })

    const [run] = await tx
      .insert(tipRuns)
      .values({
        userId: user.id,
        inputJson: runInput,
        formulaJson: formula,
        status: "pending",
        shareToken,
      })
      .returning({ id: tipRuns.id })

    // 4) Обновить prefs пользователя (последние настройки — для UI-дефолтов).
    const nextPrefs: TipUserPrefs = {
      ...(user.prefsJson ?? {}),
      depth: input.depth as TipUserPrefs["depth"],
      audience: input.audience as TipUserPrefs["audience"],
      gender: input.gender,
      displayName: input.name,
      lastRunAt: new Date().toISOString(),
    }
    await tx.update(tipUsers).set({ prefsJson: nextPrefs }).where(eq(tipUsers.id, user.id))

    return { runId: run!.id, balanceRuns: updatedUser?.balanceRuns ?? user.balanceRuns - 1 }
  })

  // 5) Запуск генерации detached — сервер долгоживущий (PM2), доработает
  // после ответа клиенту. Ошибки ловим внутри runGeneration.
  void runGeneration(runId).catch((e) => {
    // eslint-disable-next-line no-console
    console.error("[tip] runGeneration необработанная ошибка", runId, e)
  })

  return { runId, balanceRuns }
}

/**
 * Выполняет генерацию отчёта для уже созданного run (detached от HTTP-ответа).
 * status: pending -> generating -> done|error. При ошибке возвращает 1
 * прогон на баланс пользователя.
 */
async function runGeneration(runId: string): Promise<void> {
  const [run] = await db.select().from(tipRuns).where(eq(tipRuns.id, runId)).limit(1)
  if (!run) return

  await db.update(tipRuns).set({ status: "generating" }).where(eq(tipRuns.id, runId))

  try {
    const layerRows = await db.select().from(tipPromptLayers).where(eq(tipPromptLayers.isActive, true))
    const layers: TipLayers = new Map(layerRows.map((l) => [l.layerKey, l.content]))

    const input = run.inputJson
    const context = input.contexts[0]
    const birthDate = parseBirthDate(input.birthDate)
    const formula = (run.formulaJson as ReturnType<typeof computeFormula>) ?? computeFormula(birthDate)
    const age = computeAge(birthDate)

    let secondFormula: ReturnType<typeof computeFormula> | undefined
    if (input.secondPerson?.birthDate) {
      secondFormula = computeFormula(parseBirthDate(input.secondPerson.birthDate))
    }

    const requestInput: TipRequestInput = {
      name: input.name,
      gender: input.gender,
      birthDate: input.birthDate,
      context,
      role: input.role,
      depth: input.depth,
      audience: input.audience,
      question: input.extraQuestion,
      second: input.secondPerson?.birthDate
        ? { name: input.secondPerson.name, birthDate: input.secondPerson.birthDate }
        : undefined,
    }

    const prompt = buildTipPrompt({
      layers,
      input: requestInput,
      formula,
      secondFormula,
      age: age.age,
      isMinor: age.isMinor,
    })

    const result = await generateTipReport({ prompt, depth: input.depth })

    await db
      .update(tipRuns)
      .set({
        status: "done",
        resultMd: result.markdown,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        costUsd: result.costUsd !== null ? String(result.costUsd) : null,
        model: result.model,
        finishedAt: new Date(),
      })
      .where(eq(tipRuns.id, runId))
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)

    await db.transaction(async (tx) => {
      await tx
        .update(tipRuns)
        .set({ status: "error", errorText: message, finishedAt: new Date() })
        .where(eq(tipRuns.id, runId))

      // Вернуть прогон на баланс.
      const [u] = await tx.select({ balanceRuns: tipUsers.balanceRuns }).from(tipUsers).where(eq(tipUsers.id, run.userId)).limit(1)
      if (u) {
        await tx.update(tipUsers).set({ balanceRuns: u.balanceRuns + 1 }).where(eq(tipUsers.id, run.userId))
      }
    })
  }
}

// ─── Чтение прогонов ────────────────────────────────────────────────────────

export async function getRunForUser(userId: string, runId: string): Promise<TipRun | null> {
  const [run] = await db
    .select()
    .from(tipRuns)
    .where(and(eq(tipRuns.id, runId), eq(tipRuns.userId, userId)))
    .limit(1)
  return run ?? null
}

export async function getRunByShareToken(token: string): Promise<TipRun | null> {
  const [run] = await db.select().from(tipRuns).where(eq(tipRuns.shareToken, token)).limit(1)
  return run ?? null
}
