// lib/tip/bot/flow.ts
// Мастер диалога Telegram-бота «Типология» — те же шаги, что веб-форма
// (app/(public)/tip/tip-client.tsx), но кнопками/текстовым вводом. Логика
// прогона (баланс/промокоды/генерация) — ЦЕЛИКОМ в lib/tip/service.ts,
// здесь только UX-обвязка поверх неё.

import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { tipUsers, type TipUser, type TipTgSessionData } from "@/lib/db/schema"
import {
  createRun,
  activatePromo,
  claimFreeLink,
  getRunForUser,
  TipServiceError,
  TipNoBalanceError,
  type CreateRunInput,
} from "@/lib/tip/service"
import { TipCalculationError, parseBirthDate } from "@/lib/tip/calculation"
import {
  TIP_CONTEXTS,
  DEPTHS,
  AUDIENCES,
  getTipContext,
  getTipContextsByGroup,
  getDepth,
  getAudience,
  type TipContext,
} from "@/lib/tip/contexts"
import { getAppBaseUrl } from "@/lib/funnel-v2/base-url"
import {
  sendMessage,
  editMessageText,
  answerCallbackQuery,
  sendChatAction,
  sendLongMessage,
  mdToTelegramHtml,
  escapeHtml,
  type TgInlineKeyboard,
} from "@/lib/tip/bot/telegram"
import { getSession, setSession, resetSession } from "@/lib/tip/bot/sessions"
import { getOrCreateTipUserByChatId } from "@/lib/tip/bot/users"

export type BotState =
  | "idle"
  | "await_birthdate"
  | "await_name"
  | "await_gender"
  | "await_context"
  | "await_pair_choice"
  | "await_second_name"
  | "await_second_birthdate"
  | "await_role"
  | "await_depth_audience"
  | "await_confirm"
  | "await_promo"
  | "generating"

type Draft = NonNullable<TipTgSessionData["draft"]>

const DISCLAIMER =
  "Это не диагностика и не точное предсказание. Это прикладная поведенческая типология по дате рождения — " +
  "инструмент для размышления, развития и выбора стратегии поведения."

function contextButtons(group: "main" | "more"): TgInlineKeyboard {
  const items = getTipContextsByGroup(group)
  const rows: TgInlineKeyboard = []
  for (let i = 0; i < items.length; i += 2) {
    const row = items.slice(i, i + 2).map((c) => ({
      text: `${c.emoji ?? ""} ${c.title}`.trim(),
      callback_data: `ctx:${c.slug}`,
    }))
    rows.push(row)
  }
  if (group === "main") {
    rows.push([{ text: "Ещё…", callback_data: "ctx_more" }])
  }
  return rows
}

function skipButton(cb: string): TgInlineKeyboard {
  return [[{ text: "Пропустить", callback_data: cb }]]
}

// ─── Точка входа ────────────────────────────────────────────────────────────

export async function handleTextMessage(botToken: string, chatId: number, text: string): Promise<void> {
  const trimmed = text.trim()

  if (trimmed === "/start" || trimmed.startsWith("/start ")) {
    await handleStart(botToken, chatId, trimmed)
    return
  }
  if (trimmed === "/balance") {
    await handleBalance(botToken, chatId)
    return
  }
  if (trimmed === "/help") {
    await handleHelp(botToken, chatId)
    return
  }

  const session = await getSession(chatId)
  const state = (session?.state ?? "idle") as BotState
  const draft: Draft = session?.dataJson?.draft ?? {}

  switch (state) {
    case "await_birthdate":
      await stepReceiveBirthDate(botToken, chatId, trimmed, draft)
      return
    case "await_name":
      await stepReceiveName(botToken, chatId, trimmed, draft)
      return
    case "await_second_name":
      await stepReceiveSecondName(botToken, chatId, trimmed, draft)
      return
    case "await_second_birthdate":
      await stepReceiveSecondBirthDate(botToken, chatId, trimmed, draft)
      return
    case "await_role":
      await stepReceiveRole(botToken, chatId, trimmed, draft)
      return
    case "await_promo":
      await stepReceivePromo(botToken, chatId, trimmed, draft)
      return
    default:
      await sendMessage(botToken, chatId, "Не понял сообщение. Нажмите /start, чтобы начать разбор.")
      return
  }
}

export async function handleCallbackQuery(
  botToken: string,
  chatId: number,
  messageId: number,
  callbackQueryId: string,
  data: string,
): Promise<void> {
  await answerCallbackQuery(botToken, callbackQueryId)

  const session = await getSession(chatId)
  const draft: Draft = session?.dataJson?.draft ?? {}

  if (data === "ctx_more") {
    await editMessageText(botToken, chatId, messageId, "Выберите контекст разбора:", {
      keyboard: contextButtons("more"),
    })
    return
  }

  if (data.startsWith("ctx:")) {
    const slug = data.slice("ctx:".length)
    const ctx = getTipContext(slug)
    if (!ctx) return
    draft.context = slug
    await stepAfterContext(botToken, chatId, ctx, draft)
    return
  }

  if (data === "pair:me" || data === "pair:compare") {
    draft.pairMode = data === "pair:compare"
    if (draft.pairMode) {
      await setSession(chatId, "await_second_name", { draft })
      await sendMessage(botToken, chatId, "Введите имя второго человека (или нажмите «Пропустить»):", {
        keyboard: skipButton("skip:second_name"),
      })
    } else {
      await afterPairDecision(botToken, chatId, draft)
    }
    return
  }

  if (data === "skip:second_name") {
    draft.second = { ...(draft.second ?? {}), name: undefined }
    await setSession(chatId, "await_second_birthdate", { draft })
    await sendMessage(botToken, chatId, "Введите дату рождения второго человека (ДД.ММ.ГГГГ):")
    return
  }

  if (data === "skip:name") {
    draft.name = undefined
    await stepAfterName(botToken, chatId, draft)
    return
  }

  if (data === "gender:male" || data === "gender:female" || data === "skip:gender") {
    draft.gender = data === "gender:male" ? "male" : data === "gender:female" ? "female" : undefined
    await stepAfterGender(botToken, chatId, draft)
    return
  }

  if (data === "skip:role") {
    draft.role = undefined
    await afterPairDecision(botToken, chatId, draft)
    return
  }

  if (data.startsWith("depth:")) {
    draft.depth = data.slice("depth:".length)
    await setSession(chatId, "await_depth_audience", { draft })
    await promptAudience(botToken, chatId, draft)
    return
  }

  if (data.startsWith("audience:")) {
    draft.audience = data.slice("audience:".length)
    await promptConfirm(botToken, chatId, draft)
    return
  }

  if (data === "prefs:continue") {
    await promptConfirm(botToken, chatId, draft)
    return
  }
  if (data === "prefs:change") {
    await promptDepth(botToken, chatId, draft)
    return
  }

  if (data === "confirm:go") {
    await runAnalysis(botToken, chatId, draft)
    return
  }
  if (data === "confirm:cancel") {
    await resetSession(chatId)
    await sendMessage(botToken, chatId, "Отменено. Нажмите /start, чтобы начать заново.")
    return
  }

  if (data === "loop:again") {
    // Перезапуск мастера с сохранённой датой рождения текущего человека.
    await resetSession(chatId, draft.birthDate)
    await sendMessage(botToken, chatId, "Новый разбор. Выберите контекст:", {
      keyboard: contextButtons("main"),
    })
    await setSession(chatId, "await_context", { draft: { birthDate: draft.birthDate } })
    return
  }
  if (data === "loop:compare") {
    draft.pairMode = true
    await setSession(chatId, "await_second_name", { draft })
    await sendMessage(botToken, chatId, "С кем сравнить? Введите имя второго человека (или «Пропустить»):", {
      keyboard: skipButton("skip:second_name"),
    })
    return
  }

  if (data === "retry:generate") {
    await runAnalysis(botToken, chatId, draft)
    return
  }
}

// ─── /start, /balance, /help ────────────────────────────────────────────────

async function handleStart(botToken: string, chatId: number, text: string): Promise<void> {
  const payload = text.slice("/start".length).trim()

  await sendMessage(
    botToken,
    chatId,
    `<b>Типология</b> — персональный разбор личности по дате рождения.\n\n<i>${DISCLAIMER}</i>`,
  )

  if (payload.startsWith("promo_")) {
    const code = payload.slice("promo_".length)
    const user = await getTgBoundUser(chatId)
    try {
      const result = await claimFreeLink(user.id, code)
      await sendMessage(botToken, chatId, `Вам начислено разборов: ${result.runsGranted}. Текущий баланс: ${result.balanceRuns}.`)
    } catch (e) {
      const msg = e instanceof TipServiceError ? e.message : "Не удалось активировать ссылку."
      await sendMessage(botToken, chatId, msg)
    }
  }
  // "/start r_TOKEN" (реф-механика) — пока просто мастер, без спец-обработки.

  await resetSession(chatId)
  await setSession(chatId, "await_birthdate", { draft: {} })
  await sendMessage(botToken, chatId, "Введите дату рождения: ДД.ММ.ГГГГ")
}

async function handleBalance(botToken: string, chatId: number): Promise<void> {
  const user = await getTgBoundUserOrNull(chatId)
  const balance = user?.balanceRuns ?? 0
  await sendMessage(botToken, chatId, `Ваш баланс: ${balance} разбор(ов).`)
}

async function handleHelp(botToken: string, chatId: number): Promise<void> {
  await sendMessage(
    botToken,
    chatId,
    "<b>Типология</b> — разбор личности по дате рождения.\n\n" +
      "/start — начать новый разбор\n" +
      "/balance — узнать баланс\n" +
      "/help — эта справка",
  )
}

// ─── Пользователь модуля, привязанный к chat_id ────────────────────────────

async function getTgBoundUser(chatId: number) {
  return getOrCreateTipUserByChatId(chatId)
}

async function getTgBoundUserOrNull(chatId: number): Promise<TipUser | null> {
  const [row] = await db.select().from(tipUsers).where(eq(tipUsers.tgChatId, chatId)).limit(1)
  return row ?? null
}

// ─── Шаг: дата рождения ─────────────────────────────────────────────────────

async function stepReceiveBirthDate(botToken: string, chatId: number, text: string, draft: Draft): Promise<void> {
  try {
    parseBirthDate(text)
  } catch (e) {
    const msg = e instanceof TipCalculationError ? e.message : "Не удалось распознать дату. Формат: ДД.ММ.ГГГГ."
    await sendMessage(botToken, chatId, msg)
    return
  }
  draft.birthDate = text
  await setSession(chatId, "await_name", { draft })
  await sendMessage(botToken, chatId, `Принял: ${escapeHtml(text)} ✅`)
  await sendMessage(botToken, chatId, "Введите имя, если хотите:", { keyboard: skipButton("skip:name") })
}

async function stepAfterName(botToken: string, chatId: number, draft: Draft): Promise<void> {
  await setSession(chatId, "await_gender", { draft })
  await sendMessage(botToken, chatId, "Укажите пол:", {
    keyboard: [
      [
        { text: "Мужчина", callback_data: "gender:male" },
        { text: "Женщина", callback_data: "gender:female" },
      ],
      [{ text: "Пропустить", callback_data: "skip:gender" }],
    ],
  })
}

async function stepReceiveName(botToken: string, chatId: number, text: string, draft: Draft): Promise<void> {
  draft.name = text
  await sendMessage(botToken, chatId, `Принял, ${escapeHtml(text)} 👌`)
  await stepAfterName(botToken, chatId, draft)
}

async function stepAfterGender(botToken: string, chatId: number, draft: Draft): Promise<void> {
  await setSession(chatId, "await_context", { draft })
  await sendMessage(botToken, chatId, "Что хотите получить? Выберите контекст разбора:", {
    keyboard: contextButtons("main"),
  })
}

// ─── Шаг: контекст → парность/роль ──────────────────────────────────────────

async function stepAfterContext(botToken: string, chatId: number, ctx: TipContext, draft: Draft): Promise<void> {
  if (ctx.pairCapable) {
    await setSession(chatId, "await_pair_choice", { draft })
    await sendMessage(botToken, chatId, "Только про вас или сравнить с другим человеком?", {
      keyboard: [
        [
          { text: "Про меня", callback_data: "pair:me" },
          { text: "Сравнить", callback_data: "pair:compare" },
        ],
      ],
    })
    return
  }
  if (ctx.slug === "employee" || ctx.slug === "manager") {
    await setSession(chatId, "await_role", { draft })
    await sendMessage(botToken, chatId, "Укажите роль/должность (или нажмите «Пропустить»):", {
      keyboard: skipButton("skip:role"),
    })
    return
  }
  await afterPairDecision(botToken, chatId, draft)
}

async function stepReceiveSecondName(botToken: string, chatId: number, text: string, draft: Draft): Promise<void> {
  draft.second = { ...(draft.second ?? {}), name: text }
  await setSession(chatId, "await_second_birthdate", { draft })
  await sendMessage(botToken, chatId, "Введите дату рождения второго человека (ДД.ММ.ГГГГ):")
}

async function stepReceiveSecondBirthDate(botToken: string, chatId: number, text: string, draft: Draft): Promise<void> {
  try {
    parseBirthDate(text)
  } catch (e) {
    const msg = e instanceof TipCalculationError ? e.message : "Не удалось распознать дату. Формат: ДД.ММ.ГГГГ."
    await sendMessage(botToken, chatId, msg)
    return
  }
  draft.second = { ...(draft.second ?? {}), birthDate: text }
  await sendMessage(botToken, chatId, `Принял: ${escapeHtml(text)} ✅`)
  await afterPairDecision(botToken, chatId, draft)
}

async function stepReceiveRole(botToken: string, chatId: number, text: string, draft: Draft): Promise<void> {
  draft.role = text
  await afterPairDecision(botToken, chatId, draft)
}

// После парности/роли — либо продолжить свёрнутыми prefs, либо спросить глубину.
async function afterPairDecision(botToken: string, chatId: number, draft: Draft): Promise<void> {
  const user = await getTgBoundUser(chatId)
  const prefs = user.prefsJson
  if (prefs?.depth && prefs?.audience) {
    draft.depth = draft.depth ?? prefs.depth
    draft.audience = draft.audience ?? prefs.audience
    await setSession(chatId, "await_confirm", { draft })
    const depthTitle = getDepth(prefs.depth)?.title ?? prefs.depth
    const audienceTitle = getAudience(prefs.audience)?.title ?? prefs.audience
    await sendMessage(botToken, chatId, `${escapeHtml(depthTitle)} · ${escapeHtml(audienceTitle)}`, {
      keyboard: [
        [
          { text: "Продолжить так", callback_data: "prefs:continue" },
          { text: "Изменить", callback_data: "prefs:change" },
        ],
      ],
    })
    return
  }
  await promptDepth(botToken, chatId, draft)
}

async function promptDepth(botToken: string, chatId: number, draft: Draft): Promise<void> {
  await setSession(chatId, "await_depth_audience", { draft })
  await sendMessage(botToken, chatId, "Выберите глубину разбора:", {
    keyboard: DEPTHS.map((d) => [{ text: d.title, callback_data: `depth:${d.slug}` }]),
  })
}

async function promptAudience(botToken: string, chatId: number, draft: Draft): Promise<void> {
  await sendMessage(botToken, chatId, "Для кого текст?", {
    keyboard: AUDIENCES.map((a) => [{ text: a.title, callback_data: `audience:${a.slug}` }]),
  })
}

async function promptConfirm(botToken: string, chatId: number, draft: Draft): Promise<void> {
  await setSession(chatId, "await_confirm", { draft })
  const ctx = draft.context ? getTipContext(draft.context) : undefined
  const depthTitle = draft.depth ? getDepth(draft.depth)?.title ?? draft.depth : "—"
  const audienceTitle = draft.audience ? getAudience(draft.audience)?.title ?? draft.audience : "—"
  const lines = [
    "<b>Проверьте данные:</b>",
    `Дата рождения: ${escapeHtml(draft.birthDate ?? "—")}`,
    draft.name ? `Имя: ${escapeHtml(draft.name)}` : undefined,
    `Контекст: ${escapeHtml(ctx?.title ?? draft.context ?? "—")}`,
    draft.role ? `Роль: ${escapeHtml(draft.role)}` : undefined,
    draft.second?.birthDate
      ? `Второй человек: ${escapeHtml(draft.second.name ?? "без имени")}, ${escapeHtml(draft.second.birthDate)}`
      : undefined,
    `Глубина: ${escapeHtml(depthTitle)}`,
    `Для кого: ${escapeHtml(audienceTitle)}`,
  ].filter(Boolean)
  await sendMessage(botToken, chatId, lines.join("\n"), {
    keyboard: [
      [
        { text: "Начать разбор", callback_data: "confirm:go" },
        { text: "Отмена", callback_data: "confirm:cancel" },
      ],
    ],
  })
}

// ─── Прогресс-бар генерации ─────────────────────────────────────────────────
//
// Полоса из 10 ячеек (▰ заполнено / ▱ пусто), бежит слева направо по времени:
// ~90с до полной полосы, дальше держится на 9/10 с текстом «почти готово…»
// (реальная генерация может занимать до нескольких минут — полоса не должна
// «врать», что вот-вот всё, если процесс всё ещё идёт). Под полосой — сменные
// фразы по кругу, чтобы ощущалось движение, а не зависание.

const PROGRESS_CELLS = 10
const PROGRESS_FULL_MS = 90_000
const PROGRESS_PHRASES = [
  "Считаю формулу…",
  "Разбираю сочетания цифр…",
  "Собираю портрет…",
  "Пишу рекомендации…",
]

/** Строит строку прогресс-бара для момента t (мс от начала генерации). */
export function buildProgressBar(elapsedMs: number): string {
  const ratio = Math.min(elapsedMs / PROGRESS_FULL_MS, 1)
  // Пока не 100% — минимум 1 заполненная ячейка сразу после старта (видимое
  // движение с первой секунды), максимум 9/10 до фактического завершения.
  const filledExact = Math.round(ratio * PROGRESS_CELLS)
  const filled = ratio >= 1 ? PROGRESS_CELLS : Math.max(1, Math.min(PROGRESS_CELLS - 1, filledExact))
  const bar = "▰".repeat(filled) + "▱".repeat(PROGRESS_CELLS - filled)

  if (ratio >= 1) return `${bar} Готово!`

  const phraseIdx = Math.floor(elapsedMs / 4000) % PROGRESS_PHRASES.length
  const suffix = filled >= PROGRESS_CELLS - 1 ? "почти готово…" : PROGRESS_PHRASES[phraseIdx]
  return `${bar}\n${suffix}`
}

const PROGRESS_EDIT_INTERVAL_MS = 4000
const TYPING_INTERVAL_MS = 8000

/**
 * Крутит прогресс-бар в уже отправленном сообщении (editMessageText каждые
 * ~4с — не чаще, чтобы не упереться в лимиты Telegram на редактирование) и
 * параллельно шлёт sendChatAction("typing") раз в ~8с. Останавливается через
 * AbortSignal, когда основной поллинг получает финальный статус.
 */
async function runProgressTicker(
  botToken: string,
  chatId: number,
  messageId: number,
  signal: AbortSignal,
): Promise<void> {
  const startedAt = Date.now()
  let lastTypingAt = 0

  while (!signal.aborted) {
    const elapsed = Date.now() - startedAt
    await editMessageText(botToken, chatId, messageId, buildProgressBar(elapsed))

    if (Date.now() - lastTypingAt >= TYPING_INTERVAL_MS) {
      await sendChatAction(botToken, chatId, "typing")
      lastTypingAt = Date.now()
    }

    await new Promise((r) => setTimeout(r, PROGRESS_EDIT_INTERVAL_MS))
  }
}

// ─── Запуск разбора + detached-поллинг ─────────────────────────────────────

async function runAnalysis(botToken: string, chatId: number, draft: Draft): Promise<void> {
  const user = await getTgBoundUser(chatId)

  const input: CreateRunInput = {
    name: draft.name,
    gender: draft.gender,
    birthDate: draft.birthDate ?? "",
    context: draft.context ?? "",
    role: draft.role,
    depth: draft.depth ?? "short",
    audience: draft.audience ?? "self",
    question: draft.question,
    second: draft.second?.birthDate ? { name: draft.second.name, birthDate: draft.second.birthDate } : undefined,
  }

  await setSession(chatId, "generating", { draft })
  const progressMsg = await sendMessage(botToken, chatId, buildProgressBar(0))

  try {
    const result = await createRun(user, input)
    void pollAndDeliver(botToken, chatId, result.runId, draft, progressMsg?.message_id)
  } catch (e) {
    if (e instanceof TipNoBalanceError) {
      await setSession(chatId, "await_promo", { draft })
      const text = "Разборы закончились. Введите промокод, чтобы продолжить:"
      if (progressMsg) await editMessageText(botToken, chatId, progressMsg.message_id, text)
      else await sendMessage(botToken, chatId, text)
      return
    }
    if (e instanceof TipServiceError) {
      await setSession(chatId, "await_confirm", { draft })
      const keyboard: TgInlineKeyboard = [[{ text: "Попробовать снова", callback_data: "confirm:go" }]]
      if (progressMsg) await editMessageText(botToken, chatId, progressMsg.message_id, e.message, { keyboard })
      else await sendMessage(botToken, chatId, e.message, { keyboard })
      return
    }
    // eslint-disable-next-line no-console
    console.error("[tip-bot] runAnalysis", e)
    const text = "Внутренняя ошибка. Попробуйте ещё раз позже."
    if (progressMsg) await editMessageText(botToken, chatId, progressMsg.message_id, text)
    else await sendMessage(botToken, chatId, text)
  }
}

async function stepReceivePromo(botToken: string, chatId: number, text: string, draft: Draft): Promise<void> {
  const user = await getTgBoundUser(chatId)
  try {
    await activatePromo(user.id, text)
  } catch (e) {
    const msg = e instanceof TipServiceError ? e.message : "Не удалось проверить промокод."
    await sendMessage(botToken, chatId, msg)
    return
  }
  // Авто-повтор запуска разбора после успешной активации.
  await runAnalysis(botToken, chatId, draft)
}

const POLL_INTERVAL_MS = 5000
const POLL_MAX_MS = 10 * 60 * 1000

async function pollAndDeliver(
  botToken: string,
  chatId: number,
  runId: string,
  draft: Draft,
  progressMessageId: number | undefined,
): Promise<void> {
  const user = await getTgBoundUser(chatId)
  const startedAt = Date.now()

  // Бегущий прогресс-бар крутится в фоне (editMessageText каждые ~4с +
  // typing-индикатор раз в ~8с), пока основной цикл ждёт финальный статус
  // прогона. Останавливаем через AbortController, когда узнаём исход.
  const tickerAbort = new AbortController()
  const ticker = progressMessageId
    ? runProgressTicker(botToken, chatId, progressMessageId, tickerAbort.signal)
    : Promise.resolve()

  const stopTicker = async () => {
    tickerAbort.abort()
    await ticker
  }

  while (Date.now() - startedAt < POLL_MAX_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))

    let run
    try {
      run = await getRunForUser(user.id, runId)
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[tip-bot] pollAndDeliver read error", e)
      continue
    }
    if (!run) {
      await stopTicker()
      return
    }

    if (run.status === "done") {
      await stopTicker()
      if (progressMessageId) {
        await editMessageText(botToken, chatId, progressMessageId, buildProgressBar(PROGRESS_FULL_MS))
      }

      const html = mdToTelegramHtml(run.resultMd ?? "")
      const shareUrl = run.shareToken ? `${getAppBaseUrl()}/tip/r/${run.shareToken}` : undefined
      const loopKeyboard: TgInlineKeyboard = [
        [
          { text: "Ещё разбор", callback_data: "loop:again" },
          { text: "Сравнить с человеком", callback_data: "loop:compare" },
        ],
      ]
      if (shareUrl) {
        await sendMessage(botToken, chatId, "Готово! Открыть красивую версию:", {
          keyboard: [[{ text: "Открыть красивую версию", url: shareUrl }]],
        })
      }
      await sendLongMessage(botToken, chatId, html, { keyboardOnLast: loopKeyboard })
      await resetSession(chatId, draft.birthDate)
      return
    }

    if (run.status === "error") {
      await stopTicker()
      const errorText = `Не удалось составить разбор: ${escapeHtml(run.errorText ?? "неизвестная ошибка")}. Прогон возвращён на баланс.`
      const keyboard: TgInlineKeyboard = [[{ text: "Попробовать снова", callback_data: "retry:generate" }]]
      await setSession(chatId, "await_confirm", { draft })
      if (progressMessageId) {
        await editMessageText(botToken, chatId, progressMessageId, errorText, { keyboard })
      } else {
        await sendMessage(botToken, chatId, errorText, { keyboard })
      }
      return
    }
    // pending|generating — продолжаем ждать.
  }

  await stopTicker()
  await sendMessage(
    botToken,
    chatId,
    "Разбор занимает необычно много времени. Проверьте баланс через /balance или начните заново через /start.",
  )
}

// ─── Реэкспорт для webhook-роута ────────────────────────────────────────────

export { TIP_CONTEXTS }
