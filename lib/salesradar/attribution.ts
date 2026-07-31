/**
 * Каскад привязки сообщений к сделкам-нитям (раздел B плана SalesRadar).
 * «В одном чате обсуждают 5-10 сделок, разъединить их» — задача этого файла.
 *
 * Каскад (дорогое — в последнюю очередь), для каждого pending-сообщения по
 * порядку sentAt внутри threadKey:
 *   1. CRM-детерминизм — сообщение уже привязано к нити method='crm_explicit'
 *      (ставит backfill/ingest при явном bitrixDealId на источнике). Здесь
 *      просто пропускаем такие сообщения (attributionStatus уже не 'pending').
 *   2. Единственная открытая нить контрагента (пауза < 24ч с последней
 *      активности) → heuristic_single_open, confidence 0.85, AI не зовём.
 *   3. Sticky-наследование — >1 открытых нити, но дешёвый gate не увидел
 *      смены темы → наследуем нить предыдущего сообщения треда, confidence 0.7.
 *   4. Дешёвый gate «смена темы» — эвристики без AI (пауза >6ч, приветствие,
 *      новая сумма/объект не из профиля предыдущей нити, смена участника).
 *      При неоднозначности — fast-модель, лёгкий tool-call {topic_changed}.
 *   5. AI-attribution — tool-call с окном последних 15 сообщений треда +
 *      компактные профили открытых нитей контрагента. Модель fast по
 *      умолчанию, эскалация на premium при >5 открытых нитях или низкой
 *      уверенности эвристик/первого прохода.
 *   6. confidence>=0.7 и outcome=new_deal → создаём теневую сделку.
 *      confidence<0.5 → attributionStatus='pending' (не 'linked') — "требует
 *      уточнения" в UI, ручная привязка method='manual' переклассифицирует.
 *
 * PII маскируется (maskPIIFull) перед отправкой текста сообщений в модель —
 * тот же слой, что и в существующем pipeline.ts/analyzer.ts.
 */
import { and, asc, desc, eq, lt, lte, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropMessages, ropMessageDealLinks, type RopMessage, type RopDealThread } from "@/lib/db/schema"
import { callWithTool } from "@/lib/ai-rop/ai-provider"
import { checkBudget } from "@/lib/ai-rop/budget"
import { maskPIIFull } from "@/lib/ai-rop/pii-mask"
import {
  createShadowThread,
  findOpenThreadsForCounterparty,
  getThread,
  patchThreadProfile,
  threadProfile,
  touchThreadActivity,
} from "./threads"
import type { AttributionMethod, DealThreadProfilePatch } from "./types"

export interface AttributionResult {
  processed: number
  linked: number
  newDeals: number
  smallTalk: number
  pending: number
  aiCalls: number
  gateAiCalls: number
  tokensSpent: number
}

const SINGLE_THREAD_STICKY_HOURS = 24
const TOPIC_GATE_PAUSE_HOURS = 6
const AI_WINDOW_MESSAGES = 15
const ESCALATE_THREAD_COUNT = 5
const NEW_DEAL_MIN_CONFIDENCE = 0.7
const PENDING_MAX_CONFIDENCE = 0.5
// Максимум подряд идущих дешёвых (sticky/heuristic_single_open, БЕЗ полной AI-проверки)
// привязок для одного threadKey, прежде чем каскад принудительно зовёт полный
// AI-attribution даже если gate считает, что тема не менялась. Страховка от
// неограниченного дрейфа при ошибке gate на малоинформативной короткой реплике.
const STICKY_STREAK_CAP = 3

const GREETING_RE = /здравствуй|добрый день|добрый вечер|доброе утро|приветству|здрав[еи]й|hello|hi\b/i
const AMOUNT_RE = /(\d[\d\s]{2,}(?:[.,]\d+)?)\s?(?:₽|руб|р\.)|(?<!\d)\d{4,}(?!\d)/gi

function extractAmounts(text: string): string[] {
  const found = new Set<string>()
  for (const m of text.matchAll(AMOUNT_RE)) {
    const v = (m[0] ?? "").trim()
    if (v) found.add(v)
  }
  return [...found].slice(0, 5)
}

const STOPWORDS = new Set([
  "это", "того", "если", "когда", "нужно", "можно", "будет", "было", "есть",
  "который", "которая", "которые", "чтобы", "также", "просто", "очень",
  "здравствуйте", "спасибо", "пожалуйста", "добрый", "день", "вечер",
  // Общая деловая лексика — встречается в переписке про ЛЮБУЮ сделку, не
  // несёт различающего сигнала (пополнен по итогам синтетического теста —
  // именно эти слова ложно "склеивали" разные сделки через overlap-эвристику).
  "отлично", "тогда", "получится", "около", "понял", "хорошо", "давайте",
  "сегодня", "завтра", "четверг", "четверга", "почту", "адрес", "спасибо",
  "большое", "встречи", "получил", "оплачу", "записал", "ждём", "утром",
  "утру", "отправлен", "внутри", "реквизиты", "оформлю", "самовывоз",
])

function extractKeyPhrases(text: string): string[] {
  const words = (text.toLowerCase().match(/[а-яёa-z]{4,}/g) ?? []).filter((w) => !STOPWORDS.has(w))
  return [...new Set(words)].slice(0, 8)
}

/**
 * Бесплатная (без AI) проверка: содержимое сообщения явно ближе к ДРУГОЙ уже
 * открытой нити, чем к текущему sticky-кандидату? НЕ используется в основном
 * каскаде сейчас (см. docblock в attributeMessage — на синтетическом тесте
 * ухудшало точность из-за шумного profileJson.keyPhrases). Оставлена как
 * заготовка для Ф2, когда появится eval-набор для калибровки порога score.
 */
function findBetterMatchingThread(text: string, threads: RopDealThread[], excludeId: string | null): { thread: RopDealThread; score: number } | null {
  const phrases = extractKeyPhrases(text)
  const amounts = extractAmounts(text)
  let best: { thread: RopDealThread; score: number } | null = null
  for (const t of threads) {
    if (t.id === excludeId) continue
    const p = threadProfile(t)
    const vocab = new Set([...p.keyPhrases, ...p.products].map((s) => s.toLowerCase()))
    let score = 0
    for (const ph of phrases) if (vocab.has(ph)) score++
    for (const a of amounts) if (p.amounts.includes(a)) score += 2
    if (score > 0 && (!best || score > best.score)) best = { thread: t, score }
  }
  return best
}

/** Урезанная форма сообщения — то немногое, что нужно gate/sticky-эвристикам о "предыдущем" сообщении. */
type MinimalMessage = Pick<RopMessage, "id" | "sentAt" | "text" | "authorExternalId" | "authorName" | "isOurs">

interface CascadeState {
  // Последняя АКТИВНАЯ привязка для данного threadKey (не обязательно того же контрагента —
  // но threadKey у нас скоуп на уровне канал+чат, контрагент внутри него как правило один).
  lastLinkedThreadId: string | null
  lastMessage: MinimalMessage | null
  // Сколько подряд сообщений привязано дешёвыми методами (sticky/heuristic_single_open)
  // БЕЗ полной AI-проверки. Защита от неограниченного дрейфа: если gate ошибся один раз
  // (сказал "тема не изменилась" по короткой малоинформативной реплике), эта ошибка иначе
  // могла бы тянуться сколь угодно долго — периодически форсируем полный AI-attribution
  // даже если gate/эвристика говорят "не менялось" (см. STICKY_STREAK_CAP ниже).
  consecutiveCheapLinks: number
}

// Явный плоский select вместо select({msg: table, link: table}) — избегаем неоднозначности
// формы результата join'а и тянем только нужные колонки (дешевле и типобезопаснее).
async function loadLastLinkForThreadKey(companyId: string, threadKey: string, beforeSentAt: Date): Promise<CascadeState> {
  const [row] = await db
    .select({
      dealThreadId: ropMessageDealLinks.dealThreadId,
      id: ropMessages.id,
      sentAt: ropMessages.sentAt,
      text: ropMessages.text,
      authorExternalId: ropMessages.authorExternalId,
      authorName: ropMessages.authorName,
      isOurs: ropMessages.isOurs,
    })
    .from(ropMessages)
    .innerJoin(
      ropMessageDealLinks,
      and(eq(ropMessageDealLinks.messageId, ropMessages.id), sql`${ropMessageDealLinks.supersededById} IS NULL`)
    )
    .where(and(eq(ropMessages.companyId, companyId), eq(ropMessages.threadKey, threadKey), lt(ropMessages.sentAt, beforeSentAt)))
    .orderBy(desc(ropMessages.sentAt))
    .limit(1)
  if (!row) return { lastLinkedThreadId: null, lastMessage: null, consecutiveCheapLinks: 0 }
  return {
    lastLinkedThreadId: row.dealThreadId,
    lastMessage: { id: row.id, sentAt: row.sentAt, text: row.text, authorExternalId: row.authorExternalId, authorName: row.authorName, isOurs: row.isOurs },
    // Холодный старт кэша в рамках прогона крона — реальную длину streak'а не знаем
    // (стоило бы отдельного запроса по истории), консервативно начинаем с 0.
    consecutiveCheapLinks: 0,
  }
}

async function loadRecentThreadWindow(companyId: string, threadKey: string, upTo: Date, limit = AI_WINDOW_MESSAGES): Promise<RopMessage[]> {
  const rows = await db
    .select()
    .from(ropMessages)
    .where(and(eq(ropMessages.companyId, companyId), eq(ropMessages.threadKey, threadKey), lte(ropMessages.sentAt, upTo)))
    .orderBy(desc(ropMessages.sentAt))
    .limit(limit)
  return rows.reverse()
}

async function createLink(args: {
  companyId: string
  messageId: string
  dealThreadId: string
  confidence: number
  method: AttributionMethod
  modelVersion?: string | null
  evidence?: string | null
}): Promise<void> {
  await db.insert(ropMessageDealLinks).values({
    companyId: args.companyId,
    messageId: args.messageId,
    dealThreadId: args.dealThreadId,
    confidence: String(args.confidence),
    method: args.method,
    modelVersion: args.modelVersion ?? null,
    evidence: args.evidence ?? null,
  })
  await db.update(ropMessages).set({ attributionStatus: "linked" }).where(eq(ropMessages.id, args.messageId))
  await touchThreadActivity(args.dealThreadId, new Date())
}

async function markPending(messageId: string): Promise<void> {
  await db.update(ropMessages).set({ attributionStatus: "pending" }).where(eq(ropMessages.id, messageId))
}

const GATE_SCHEMA = {
  type: "object" as const,
  properties: {
    topic_changed: { type: "boolean", description: "true — новое сообщение открывает новую тему/сделку, false — продолжение текущей." },
    reason: { type: "string" },
  },
  required: ["topic_changed"],
}

/** Дешёвый gate: сначала эвристики, при неоднозначности — лёгкий fast-вызов. */
async function detectTopicChange(args: {
  companyId: string
  message: RopMessage
  prevMessage: MinimalMessage | null
  prevThread: RopDealThread | null
}): Promise<{ changed: boolean; usedAi: boolean; tokens: number }> {
  const text = args.message.text ?? ""
  const prevText = args.prevMessage?.text ?? ""

  if (!args.prevMessage || !args.prevThread) return { changed: true, usedAi: false, tokens: 0 }

  const pauseHours = (args.message.sentAt.getTime() - args.prevMessage.sentAt.getTime()) / 3_600_000
  const hasGreeting = GREETING_RE.test(text)
  const amounts = extractAmounts(text)
  const profile = threadProfile(args.prevThread)
  const newAmount = amounts.some((a) => !profile.amounts.includes(a))
  const newParticipant = !!args.message.authorExternalId && !profile.participants.includes(args.message.authorExternalId)

  // Пересечение по содержанию с профилем нити-кандидата (продукты/ключевые фразы) —
  // без этого сигнала пауза+без-приветствия ошибочно "усыпляла" gate даже когда
  // сообщение явно про другой товар/объект (см. синтетический тест: 3 сделки без
  // явных пауз/приветствий между репликами одного и того же диалога).
  const currentPhrases = extractKeyPhrases(text)
  const profileVocab = new Set([...profile.keyPhrases, ...profile.products].map((p) => p.toLowerCase()))
  const hasContentOverlap = profileVocab.size === 0 || currentPhrases.some((p) => profileVocab.has(p))

  // Явные сигналы — решаем без AI.
  if (pauseHours > TOPIC_GATE_PAUSE_HOURS && hasGreeting) return { changed: true, usedAi: false, tokens: 0 }
  if (pauseHours <= 0.25 && !hasGreeting && !newAmount && hasContentOverlap) return { changed: false, usedAi: false, tokens: 0 }

  const ambiguous = hasGreeting || newAmount || newParticipant || pauseHours > TOPIC_GATE_PAUSE_HOURS || !hasContentOverlap
  if (!ambiguous) return { changed: false, usedAi: false, tokens: 0 }

  // Неоднозначно — короткий fast-вызов вместо эвристического угадывания.
  try {
    await checkBudget(args.companyId, "anthropic_tokens")
    const masked = await maskPIIFull(text)
    const prevMasked = await maskPIIFull(prevText)
    const out = await callWithTool<{ topic_changed: boolean; reason?: string }>({
      toolName: "save_gate",
      schema: GATE_SCHEMA,
      system: "Ты определяешь, начинается ли в переписке отдела продаж новая тема/сделка. Отвечай кратко, вызови save_gate.",
      user: `Предыдущее сообщение в этом чате:\n"""${prevMasked.slice(0, 500)}"""\n\nТекущее сообщение (пауза ${pauseHours.toFixed(1)}ч):\n"""${masked.slice(0, 500)}"""\n\nЭто продолжение той же сделки или начало новой темы?`,
      modelTier: "fast",
      maxTokens: 150,
      companyId: args.companyId,
      action: "deal_attribution_gate",
    })
    const tokens = out.inputTokens + out.outputTokens
    return { changed: !!out.result?.topic_changed, usedAi: true, tokens }
  } catch (e) {
    console.warn(`[salesradar/attribution] gate AI fail-open → считаем что тема не менялась: ${(e as Error).message}`)
    return { changed: false, usedAi: false, tokens: 0 }
  }
}

interface AiAttributionOutput {
  outcome: "linked" | "new_deal" | "small_talk" | "unclear"
  deal_thread_id: string | null
  confidence: number
  evidence: string
  proposed_title: string | null
  profile_patch: DealThreadProfilePatch
}

const ATTRIBUTION_SCHEMA = {
  type: "object" as const,
  properties: {
    outcome: {
      type: "string",
      enum: ["linked", "new_deal", "small_talk", "unclear"],
      description:
        "linked — сообщение относится к одной из перечисленных существующих нитей (укажи deal_thread_id). " +
        "new_deal — это новая сделка/тема, которой нет среди перечисленных. " +
        "small_talk — не относится ни к одной сделке (приветствие, оффтоп, благодарность без контекста). " +
        "unclear — недостаточно данных, чтобы решить.",
    },
    deal_thread_id: { type: ["string", "null"], description: "id нити при outcome=linked, иначе null." },
    confidence: { type: "number", description: "0..1" },
    evidence: { type: "string", description: "Короткая цитата/причина решения." },
    proposed_title: { type: ["string", "null"], description: "Заголовок для new_deal, напр. 'Поставка профнастила'." },
    profile_patch: {
      type: "object",
      description: "Новые факты для профиля нити — только то, что реально упомянуто в сообщении.",
      properties: {
        products: { type: "array", items: { type: "string" } },
        keyPhrases: { type: "array", items: { type: "string" } },
        participants: { type: "array", items: { type: "string" } },
        amounts: { type: "array", items: { type: "string" } },
        objects: { type: "array", items: { type: "string" } },
        aliases: { type: "array", items: { type: "string" } },
      },
    },
  },
  required: ["outcome", "confidence"],
}

function formatWindow(messages: RopMessage[], maskedTexts: string[]): string {
  return messages
    .map((m, i) => `[${m.sentAt.toISOString()}] ${m.isOurs ? "МЫ" : "КЛИЕНТ"}${m.authorName ? ` (${m.authorName})` : ""}: ${maskedTexts[i] || "(без текста)"}`)
    .join("\n")
}

function formatCandidateThreads(threads: RopDealThread[]): string {
  if (!threads.length) return "(открытых нитей у контрагента нет)"
  return threads
    .map((t) => {
      const p = threadProfile(t)
      return `- id=${t.id} title="${t.title ?? "без названия"}" продукты=[${p.products.join(", ")}] фразы=[${p.keyPhrases.slice(-8).join(", ")}] суммы=[${p.amounts.join(", ")}] последнее="${p.lastSnippets.at(-1) ?? ""}"`
    })
    .join("\n")
}

async function runAiAttribution(args: {
  companyId: string
  message: RopMessage
  window: RopMessage[]
  candidateThreads: RopDealThread[]
  tier: "fast" | "premium"
}): Promise<{ out: AiAttributionOutput; tokens: number }> {
  await checkBudget(args.companyId, "anthropic_tokens")
  const maskedTexts = await Promise.all(args.window.map((m) => maskPIIFull(m.text ?? "")))

  const out = await callWithTool<AiAttributionOutput>({
    toolName: "save_attribution",
    schema: ATTRIBUTION_SCHEMA,
    system:
      "Ты разбираешь переписку отдела продаж, в которой в одном чате вперемешку могут обсуждаться несколько разных сделок " +
      "(разные товары/услуги, разные суммы, разные объекты). Твоя задача — определить, к какой из уже открытых сделок-нитей " +
      "относится ПОСЛЕДНЕЕ сообщение в окне переписки, либо что это новая сделка, либо что это не относится к сделкам вовсе (small talk). " +
      "Решай по содержанию (товар/услуга, сумма, адрес/объект, номер заказа), а не только по времени.",
    user:
      `Открытые сделки-нити этого контрагента:\n${formatCandidateThreads(args.candidateThreads)}\n\n` +
      `Окно переписки (последнее сообщение — то, которое нужно классифицировать):\n${formatWindow(args.window, maskedTexts)}\n\n` +
      `Вызови save_attribution для последнего сообщения в окне.`,
    modelTier: args.tier,
    maxTokens: 700,
    companyId: args.companyId,
    action: "deal_attribution",
  })
  return { out: out.result, tokens: out.inputTokens + out.outputTokens }
}

/**
 * Обработать один message через каскад. Возвращает применённый исход +
 * потраченные токены (для агрегированной статистики вызывающей стороны).
 */
async function attributeMessage(args: {
  companyId: string
  message: RopMessage
  state: CascadeState
}): Promise<{
  outcome: "linked" | "new_deal" | "small_talk" | "unclear" | "pending"
  tokens: number
  aiCalled: boolean
  gateAiCalled: boolean
  usedCheapPath: boolean // true — привязано БЕЗ полного AI-attribution (sticky/heuristic_single_open), для STICKY_STREAK_CAP
}> {
  const { companyId, message, state } = args
  let gateTokensSpent = 0
  let gateAiUsed = false

  if (!message.counterpartyId) {
    // Без опознанного контрагента каскад бессилен — ждём identity resolution (ingest.ts, зона другого агента).
    await markPending(message.id)
    return { outcome: "pending", tokens: 0, aiCalled: false, gateAiCalled: false, usedCheapPath: false }
  }

  const openThreads = await findOpenThreadsForCounterparty(companyId, message.counterpartyId)

  // Кандидат для sticky-проверки: нить, к которой было привязано ПРЕДЫДУЩЕЕ сообщение
  // этого же threadKey (если она всё ещё открыта), иначе — единственная открытая нить.
  // ВАЖНО: даже когда нить одна, её нельзя брать не глядя (см. правку по итогам
  // синтетического теста — "1 открытая нить" не означает "тема не сменилась", когда
  // разные сделки того же контрагента ещё не выявлены как отдельные нити).
  const stickyCandidateId = state.lastLinkedThreadId && openThreads.some((t) => t.id === state.lastLinkedThreadId)
    ? state.lastLinkedThreadId
    : openThreads.length === 1
      ? openThreads[0].id
      : null

  // Страховка от неограниченного дрейфа: streak дешёвых привязок подряд исчерпан →
  // форсируем полный AI-attribution на этом сообщении, даже если gate скажет "не менялось".
  const streakExhausted = state.consecutiveCheapLinks >= STICKY_STREAK_CAP

  if (stickyCandidateId && !streakExhausted) {
    const candidateThread = openThreads.find((t) => t.id === stickyCandidateId) ?? (await getThread(stickyCandidateId))
    if (candidateThread) {
      // Первое сообщение вообще для этой нити/контрагента в рамках каскада (нет prevMessage
      // из этого же threadKey) — сравнивать не с чем, линкуем сразу дешёвой эвристикой.
      //
      // ГОТЧА (по итогам синтетического теста, 3 прогона): пробовал ещё один "бесплатный"
      // слой ПЕРЕД gate — findBetterMatchingThread(), форсирующий changed=true без AI, если
      // content явно ближе к другой открытой нити. На адверсарном тесте (round-robin из 3 тем
      // без явных маркеров смены) это НЕ помогло: даже со строгим порогом (score>=2) purity
      // упала с 76.7% до 43-60% между прогонами — детерминированный overlap по зашумлённому
      // profileJson.keyPhrases (общая лексика деловой переписки) ложно триггерил "смену темы"
      // чаще, чем реальная AI-оценка полного контекста. Оставлен только detectTopicChange
      // (эвристики + fast-модель на неоднозначности) + STICKY_STREAK_CAP как страховка от
      // накопительного дрейфа; функция findBetterMatchingThread оставлена в файле для Ф2
      // (нужен нормальный eval-набор, чтобы откалибровать порог, а не гадать на 30 сообщениях).
      const isFirstTouch = !state.lastMessage
      const gate = isFirstTouch
        ? { changed: false, usedAi: false, tokens: 0 }
        : await detectTopicChange({ companyId, message, prevMessage: state.lastMessage, prevThread: candidateThread })

      if (!gate.changed) {
        const method: AttributionMethod = state.lastLinkedThreadId === stickyCandidateId ? "sticky" : "heuristic_single_open"
        const confidence = method === "heuristic_single_open" ? 0.85 : 0.7
        await createLink({ companyId, messageId: message.id, dealThreadId: candidateThread.id, confidence, method })
        await patchThreadProfile(candidateThread.id, {
          amounts: extractAmounts(message.text ?? ""),
          keyPhrases: extractKeyPhrases(message.text ?? ""),
          lastSnippets: [message.text ?? ""].filter(Boolean),
          participants: message.authorExternalId ? [message.authorExternalId] : [],
        })
        return { outcome: "linked", tokens: gate.tokens, aiCalled: false, gateAiCalled: gate.usedAi, usedCheapPath: true }
      }
      // gate сказал "сменилась тема" → идём в полный AI-attribution ниже, токены gate добавим к итогу.
      gateTokensSpent += gate.tokens
      gateAiUsed = gate.usedAi
    }
  }

  // Шаг 5: полноценный AI-attribution.
  const window = await loadRecentThreadWindow(companyId, message.threadKey, message.sentAt)
  const tier: "fast" | "premium" = openThreads.length > ESCALATE_THREAD_COUNT ? "premium" : "fast"
  let ai: { out: AiAttributionOutput; tokens: number }
  try {
    ai = await runAiAttribution({ companyId, message, window, candidateThreads: openThreads, tier })
  } catch (e) {
    console.warn(`[salesradar/attribution] AI-attribution ошибка (${(e as Error).message}) → pending`)
    await markPending(message.id)
    return { outcome: "pending", tokens: gateTokensSpent, aiCalled: false, gateAiCalled: gateAiUsed, usedCheapPath: false }
  }
  let { out, tokens } = ai
  tokens += gateTokensSpent
  const aiCalled = true

  // Низкая уверенность fast-модели при наличии нескольких кандидатов — одна эскалация на premium.
  if (tier === "fast" && out.confidence < 0.6 && openThreads.length > 1) {
    try {
      const escalated = await runAiAttribution({ companyId, message, window, candidateThreads: openThreads, tier: "premium" })
      out = escalated.out
      tokens += escalated.tokens
    } catch (e) {
      console.warn(`[salesradar/attribution] эскалация на premium не удалась (${(e as Error).message}), используем fast-результат`)
    }
  }

  const modelVersion = tier

  if (out.outcome === "small_talk") {
    await db.update(ropMessages).set({ attributionStatus: "skipped" }).where(eq(ropMessages.id, message.id))
    return { outcome: "small_talk", tokens, aiCalled, gateAiCalled: gateAiUsed, usedCheapPath: false }
  }

  if (out.outcome === "linked" && out.deal_thread_id && out.confidence >= NEW_DEAL_MIN_CONFIDENCE) {
    const target = openThreads.find((t) => t.id === out.deal_thread_id)
    if (target) {
      await createLink({
        companyId, messageId: message.id, dealThreadId: target.id, confidence: out.confidence,
        method: "ai", modelVersion, evidence: out.evidence,
      })
      await patchThreadProfile(target.id, { ...out.profile_patch, lastSnippets: [message.text ?? ""].filter(Boolean) })
      return { outcome: "linked", tokens, aiCalled, gateAiCalled: gateAiUsed, usedCheapPath: false }
    }
  }

  if (out.outcome === "new_deal" && out.confidence >= NEW_DEAL_MIN_CONFIDENCE) {
    const created = await createShadowThread({
      companyId,
      counterpartyId: message.counterpartyId,
      title: out.proposed_title,
      confidence: out.confidence,
      profile: { ...out.profile_patch, lastSnippets: [message.text ?? ""].filter(Boolean) },
    })
    await createLink({
      companyId, messageId: message.id, dealThreadId: created.id, confidence: out.confidence,
      method: "ai", modelVersion, evidence: out.evidence,
    })
    return { outcome: "new_deal", tokens, aiCalled, gateAiCalled: gateAiUsed, usedCheapPath: false }
  }

  // confidence < 0.5 (или 0.5-0.7 без уверенного linked/new_deal) — не создаём/не привязываем, ждём человека.
  if (out.confidence < PENDING_MAX_CONFIDENCE || out.outcome === "unclear") {
    await markPending(message.id)
    return { outcome: "pending", tokens, aiCalled, gateAiCalled: gateAiUsed, usedCheapPath: false }
  }

  // 0.5..0.7 неоднозначный случай, консервативно — тоже pending (см. docblock).
  await markPending(message.id)
  return { outcome: "unclear", tokens, aiCalled, gateAiCalled: gateAiUsed, usedCheapPath: false }
}

/**
 * Обработать пачку pending-сообщений одной компании, по threadKey и в
 * хронологическом порядке (каскад зависит от предыдущего сообщения треда).
 * budgetMs — мягкий таймбюджет для крона (по образцу ai-rop-import).
 */
export async function attributeCompanyMessages(
  companyId: string,
  opts: { limit?: number; budgetMs?: number } = {}
): Promise<AttributionResult> {
  const limit = opts.limit ?? 200
  const budgetMs = opts.budgetMs ?? 40_000
  const t0 = Date.now()

  const pending = await db
    .select()
    .from(ropMessages)
    .where(and(eq(ropMessages.companyId, companyId), eq(ropMessages.attributionStatus, "pending")))
    .orderBy(asc(ropMessages.threadKey), asc(ropMessages.sentAt))
    .limit(limit)

  const result: AttributionResult = { processed: 0, linked: 0, newDeals: 0, smallTalk: 0, pending: 0, aiCalls: 0, gateAiCalls: 0, tokensSpent: 0 }

  // Кэш «последней привязки по threadKey» в рамках этого прогона — не дёргаем БД
  // повторно за уже обработанными в этом же батче сообщениями того же треда.
  const stickyCache = new Map<string, CascadeState>()

  for (const message of pending) {
    if (Date.now() - t0 > budgetMs) break

    let state = stickyCache.get(message.threadKey)
    if (!state) {
      state = await loadLastLinkForThreadKey(companyId, message.threadKey, message.sentAt)
    }

    const r = await attributeMessage({ companyId, message, state })
    result.processed++
    result.tokensSpent += r.tokens
    if (r.aiCalled) result.aiCalls++
    if (r.gateAiCalled) result.gateAiCalls++
    if (r.outcome === "linked") {
      result.linked++
    } else if (r.outcome === "new_deal") {
      result.linked++
      result.newDeals++
    } else if (r.outcome === "small_talk") {
      result.smallTalk++
    } else {
      result.pending++
    }

    // Обновляем sticky-состояние для следующего сообщения этого же threadKey.
    const [freshLink] = await db
      .select({ dealThreadId: ropMessageDealLinks.dealThreadId })
      .from(ropMessageDealLinks)
      .where(and(eq(ropMessageDealLinks.messageId, message.id), sql`${ropMessageDealLinks.supersededById} IS NULL`))
      .limit(1)
    stickyCache.set(message.threadKey, {
      lastLinkedThreadId: freshLink?.dealThreadId ?? state.lastLinkedThreadId,
      lastMessage: message,
      consecutiveCheapLinks: r.usedCheapPath ? state.consecutiveCheapLinks + 1 : 0,
    })
  }

  return result
}
