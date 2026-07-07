// Бизнес-логика модуля «Типология» поверх БД: активация промокодов/бесплатных
// ссылок, создание прогона разбора (с detached-генерацией через AI) и чтение
// готовых прогонов (для владельца и по share-токену).
//
// Оплата ОТКЛЮЧЕНА на старте — доступ только через промокоды/бесплатные ссылки,
// прогоны списываются с tip_users.balance_runs.

import { randomBytes } from "crypto"
import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { processReferralActivation } from "@/lib/tip/referral"
import { extractTipHighlights } from "@/lib/tip/highlights"
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

/**
 * Postgres unique_violation (23505) — учитывает, что drizzle-orm заворачивает
 * driver-ошибку в DrizzleQueryError, где .code лежит на .cause, а не на самой
 * ошибке (обнаружено при smoke-тесте личных кодов: старая проверка e.code
 * никогда не срабатывала на текущей версии drizzle-orm/postgres, из-за чего
 * повторная активация обычного промокода падала непойманной 500-кой вместо
 * дружелюбного "Промокод уже использован").
 */
function isUniqueViolation(e: unknown): boolean {
  const code = (e as { code?: string })?.code ?? (e as { cause?: { code?: string } })?.cause?.code
  return code === "23505"
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
  personal?: false
  balanceRuns: number
  runsGranted: number
}

/**
 * Личный код-пропуск (0265): активация НЕ начисляет прогоны и НЕ пишет
 * tip_promo_activations — код можно вводить сколько угодно раз. Вызывающий
 * роут (app/api/public/tip/promo/route.ts) переключает cookie tip_uid на
 * ownerUserId через lib/tip/session.ts::switchTipUserCookie.
 */
interface ActivatePersonalResult {
  personal: true
  ownerUserId: string
}

type ActivateCodeResult = ActivatePromoResult | ActivatePersonalResult

async function activateCodeInternal(
  userId: string,
  rawCode: string,
  requireFreeLink: boolean,
): Promise<ActivateCodeResult> {
  const code = (rawCode ?? "").trim()
  if (!code) {
    throw new TipServiceError("Промокод не найден")
  }

  return db.transaction(async (tx) => {
    // Регистронезависимый поиск + trim — сравниваем по lower(code). НЕ
    // зависит от формата кода (короткие обычные / длинные личные) — просто
    // строковое сравнение, так и должно оставаться при смене форматов.
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

    // Личный код-пропуск: НЕ активация в обычном смысле — не пишем
    // tip_promo_activations, не трогаем activations_count/баланс. Сигнал
    // вызывающему коду переключить cookie на владельца.
    if (promo.isPersonal) {
      if (!promo.ownerUserId) {
        throw new TipServiceError("Промокод не найден")
      }
      return { personal: true as const, ownerUserId: promo.ownerUserId }
    }

    // Вставку активации делаем ДО инкремента счётчика — unique(promo_id,
    // user_id) ловит повторную активацию того же юзера (в т.ч. при гонке
    // двух параллельных запросов одного пользователя). Код 23505 —
    // unique_violation (Postgres), остальные ошибки пробрасываем как есть.
    try {
      await tx.insert(tipPromoActivations).values({ promoId: promo.id, userId })
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new TipServiceError("Промокод уже использован")
      }
      throw e
    }

    // Атомарный check-and-increment: 0 обновлённых строк = лимит исчерпан
    // ИЛИ гонка с параллельной активацией — в обоих случаях гарантированно
    // не превысим max_activations, т.к. условие проверяется в самом UPDATE.
    const [updatedPromo] = await tx
      .update(tipPromoCodes)
      .set({ activationsCount: sql`${tipPromoCodes.activationsCount} + 1` })
      .where(
        and(
          eq(tipPromoCodes.id, promo.id),
          or(isNull(tipPromoCodes.maxActivations), lt(tipPromoCodes.activationsCount, tipPromoCodes.maxActivations)),
        ),
      )
      .returning({ runsGranted: tipPromoCodes.runsGranted })
    if (!updatedPromo) {
      throw new TipServiceError("Лимит активаций исчерпан")
    }

    // Начисление баланса — тоже атомарный относительный инкремент.
    const [updatedUser] = await tx
      .update(tipUsers)
      .set({ balanceRuns: sql`${tipUsers.balanceRuns} + ${promo.runsGranted}` })
      .where(eq(tipUsers.id, userId))
      .returning({ balanceRuns: tipUsers.balanceRuns })

    return {
      personal: false as const,
      balanceRuns: updatedUser?.balanceRuns ?? promo.runsGranted,
      runsGranted: promo.runsGranted,
    }
  })
}

/**
 * Активирует обычный промокод (пополняет balance_runs) ИЛИ личный код-пропуск
 * (переключает аккаунт — см. ActivatePersonalResult). Русские ошибки.
 */
export async function activatePromo(userId: string, code: string): Promise<ActivateCodeResult> {
  return activateCodeInternal(userId, code, false)
}

/** Активирует бесплатную ссылку (tip_promo_codes.is_free_link = true). */
export async function claimFreeLink(userId: string, token: string): Promise<ActivatePromoResult> {
  const result = await activateCodeInternal(userId, token, true)
  // Личные коды не бывают одновременно бесплатными ссылками (разные UX-пути),
  // но подстрахуемся типобезопасно — не отдаём наружу переключение аккаунта
  // там, где вызывающий код (claimFreeLink) этого не ожидает.
  if (result.personal) {
    throw new TipServiceError("Промокод не найден")
  }
  return result
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

// Ограничения длины полей ввода — защита от переразмеренного user-input,
// улетающего в промпт AI (стоимость токенов) и в БД/шеринг-карточки.
const MAX_NAME_LEN = 80
const MAX_ROLE_LEN = 80
const MAX_QUESTION_LEN = 300

/**
 * Создаёт прогон разбора: валидирует вход, проверяет баланс, списывает 1
 * прогон, сохраняет запись tip_runs (status=pending) и запускает генерацию
 * detached (не блокирует ответ клиенту). При ошибке генерации run переходит
 * в status=error и прогон возвращается пользователю на баланс.
 */
export async function createRun(user: TipUser, rawInput: CreateRunInput): Promise<CreateRunResult> {
  // Обрезаем строковые поля ДО любой валидации/использования.
  const input: CreateRunInput = {
    ...rawInput,
    name: rawInput.name?.trim().slice(0, MAX_NAME_LEN),
    role: rawInput.role?.trim().slice(0, MAX_ROLE_LEN),
    question: rawInput.question?.trim().slice(0, MAX_QUESTION_LEN),
    second: rawInput.second
      ? { ...rawInput.second, name: rawInput.second.name?.trim().slice(0, MAX_NAME_LEN) }
      : undefined,
  }

  // Ленивый репер: чинит зависшие после рестарта PM2 прогоны ДО гварда
  // «один активный», иначе пользователь с зависшим generating навсегда
  // застревал бы на "Дождитесь завершения текущего разбора".
  await reapStaleRuns(user.id)

  // Если передан промокод — активировать ДО проверки баланса (ошибку промокода
  // возвращаем как есть, TipServiceError с русским текстом).
  if (input.promoCode?.trim()) {
    const promoResult = await activatePromo(user.id, input.promoCode)
    // Личный код-пропуск переключает аккаунт, а не начисляет прогоны — этот
    // путь (создание прогона) для него не подходит, активируется отдельным
    // экраном входа (app/api/public/tip/promo/route.ts).
    if (promoResult.personal) {
      throw new TipServiceError("Это личный код-пропуск — введите его на экране входа, а не при создании разбора.")
    }
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
    // Атомарное списание: 0 обновлённых строк = баланс уже исчерпан гонкой
    // с другим параллельным запросом (снапшот user.balanceRuns выше — только
    // fast-path проверка, истина — этот UPDATE ... WHERE balance_runs >= 1).
    const [updatedUser] = await tx
      .update(tipUsers)
      .set({ balanceRuns: sql`${tipUsers.balanceRuns} - 1` })
      .where(and(eq(tipUsers.id, user.id), sql`${tipUsers.balanceRuns} >= 1`))
      .returning({ balanceRuns: tipUsers.balanceRuns })
    if (!updatedUser) {
      throw new TipNoBalanceError()
    }

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
      name: input.name,
      birthDate: input.birthDate,
      lastRunAt: new Date().toISOString(),
    }
    await tx.update(tipUsers).set({ prefsJson: nextPrefs }).where(eq(tipUsers.id, user.id))

    return { runId: run!.id, balanceRuns: updatedUser.balanceRuns }
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

    // Реферальный бонус пригласившему (идемпотентно, no-op без pending-реферала).
    void processReferralActivation(run.userId).catch((e) => {
      console.error("[tip] processReferralActivation", run.userId, e)
    })

    // Цитаты-выносы и сильные стороны для красивого отчёта и шеринг-карточек
    // (дешёвый Haiku-вызов; ошибка не критична — отчёт живёт и без выносов).
    void extractTipHighlights(result.markdown)
      .then((h) =>
        h && (h.quotes.length || h.strengths.length)
          ? db.update(tipRuns).set({ highlightsJson: h }).where(eq(tipRuns.id, runId))
          : undefined,
      )
      .catch((e) => {
        console.error("[tip] extractTipHighlights", runId, e)
      })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)

    await db.transaction(async (tx) => {
      await tx
        .update(tipRuns)
        .set({ status: "error", errorText: message, finishedAt: new Date() })
        .where(eq(tipRuns.id, runId))

      // Вернуть прогон на баланс — атомарный относительный инкремент.
      await tx
        .update(tipUsers)
        .set({ balanceRuns: sql`${tipUsers.balanceRuns} + 1` })
        .where(eq(tipUsers.id, run.userId))
    })
  }
}

// ─── Репер зависших прогонов ────────────────────────────────────────────────

// 20 мин: больше worst-case легальной генерации (full 480с × 2 попытки +
// backoff ≈ 16.5 мин) — иначе реапер убивал живые длинные прогоны, а поздний
// done отбрасывался условным UPDATE (гонка, guard-фикс 8640e887).
const STALE_RUN_MINUTES = 20

/**
 * Помечает прогоны в status pending/generating старше STALE_RUN_MINUTES как
 * error и возвращает их владельцам на баланс. Вызывается лениво из createRun
 * (до гварда «один активный») и getRunForUser (чтобы поллинг веб/бота сам
 * чинил зависший после рестарта PM2 прогон), а также из cron-роута
 * app/api/cron/tip-reaper без userId — на случай, если ни один из двух
 * ленивых путей не был вызван (пользователь просто не вернулся).
 *
 * Идемпотентно: UPDATE ... WHERE status IN (...) AND created_at < cutoff
 * RETURNING — при повторном вызове (в т.ч. параллельном) уже обработанные
 * строки status='error' условию не соответствуют, поэтому баланс не
 * начислится дважды.
 */
export async function reapStaleRuns(userId?: string): Promise<{ reaped: number }> {
  const cutoff = new Date(Date.now() - STALE_RUN_MINUTES * 60 * 1000)
  const conditions = [inArray(tipRuns.status, ["pending", "generating"]), lt(tipRuns.createdAt, cutoff)]
  if (userId) conditions.push(eq(tipRuns.userId, userId))

  const stale = await db
    .update(tipRuns)
    .set({
      status: "error",
      errorText: "Генерация прервана перезапуском сервера — прогон возвращён на баланс.",
      finishedAt: new Date(),
    })
    .where(and(...conditions))
    .returning({ id: tipRuns.id, userId: tipRuns.userId })

  for (const row of stale) {
    await db
      .update(tipUsers)
      .set({ balanceRuns: sql`${tipUsers.balanceRuns} + 1` })
      .where(eq(tipUsers.id, row.userId))
  }

  return { reaped: stale.length }
}

// ─── Чтение прогонов ────────────────────────────────────────────────────────

export async function getRunForUser(userId: string, runId: string): Promise<TipRun | null> {
  await reapStaleRuns(userId)

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
