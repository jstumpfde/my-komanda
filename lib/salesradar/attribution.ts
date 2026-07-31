/**
 * Привязка сообщений к сделкам-нитям (раздел B плана SalesRadar).
 * «В одном чате обсуждают 5-10 сделок, разъединить их» — задача этого файла.
 *
 * АРХИТЕКТУРА: ОКОННАЯ (батчевая) разметка, а не пошаговая.
 *
 * Первая версия каскада решала по одному сообщению за раз (sticky-наследование
 * + дешёвый gate «сменилась ли тема» + AI только на подозрении). На адверсарной
 * переписке (3 сделки round-robin в одном чате) это давало 50-77% чистоты:
 * одна ошибка gate'а на короткой малоинформативной реплике («Хорошо, а когда
 * забрать?») наследовалась дальше по sticky и тянула за собой хвост сообщений.
 * Модель при этом видела только «предыдущее сообщение» и не могла понять, что
 * реплика отвечает не на него, а на сообщение тремя строками выше.
 *
 * Теперь: сообщения треда режутся на окна по WINDOW_SIZE, и модель размечает
 * ВСЁ окно за один вызов, видя его целиком (контекст вперёд и назад) плюс
 * хвост уже размеченных сообщений с их метками. Это одновременно
 *   - точнее: видно, кто кому отвечает, и параллельные ветки разговора;
 *   - дешевле: 1 вызов на ~12 сообщений вместо 1-2 вызовов на КАЖДОЕ
 *     сообщение (gate + attribution).
 *
 * Порядок работы для каждого threadKey:
 *   1. CRM-детерминизм — сообщения с уже проставленной привязкой
 *      (attributionStatus != 'pending') в выборку не попадают вовсе.
 *   2. Детерминированный матч по сущностям — сумма/артикул/адрес/номер заказа
 *      из сообщения ТОЧНО совпадает ровно с одной открытой нитью и ни с одной
 *      другой → привязка без AI (method='heuristic_single_open'). Работает
 *      только на «жёстких» сущностях (цифры/коды), НЕ на общей лексике —
 *      попытка матчить по пересечению ключевых слов проверялась и ухудшала
 *      точность (общая деловая лексика ложно склеивает разные сделки).
 *   3. Единственная открытая нить + окно без признаков новой темы
 *      (приветствие/новый участник/длинная пауза) → привязка без AI.
 *   4. Всё остальное окно уходит в один AI-вызов с полными профилями открытых
 *      нитей + хвостом размеченного контекста. Модель возвращает метку для
 *      КАЖДОГО сообщения окна (существующая нить / новая сделка / small talk)
 *      с confidence и evidence.
 *   5. Ревизия (второй проход): если внутри окна остались сообщения с низкой
 *      уверенностью ИЛИ окно «раздробило» соседние реплики одного автора,
 *      окно переразмечается моделью старшего уровня, старые привязки гасятся
 *      через supersededById (история сохраняется, см. схему).
 *   6. confidence < PENDING_MAX_CONFIDENCE → attributionStatus='pending'
 *      («требует уточнения» в UI), ручная привязка method='manual'.
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
  /** Вызовы модели ревизии (второй проход). Раньше — вызовы дешёвого topic-gate'а. */
  gateAiCalls: number
  tokensSpent: number
}

/** Сколько pending-сообщений одного треда размечается за один AI-вызов. */
const WINDOW_SIZE = 12
/** Сколько уже размеченных сообщений треда показываем как контекст (с их метками). */
const CONTEXT_SIZE = 8
/** Больше этого числа открытых нитей у контрагента → сразу премиум-модель. */
const ESCALATE_THREAD_COUNT = 5
const NEW_DEAL_MIN_CONFIDENCE = 0.7
const PENDING_MAX_CONFIDENCE = 0.5
/** Ниже этого — окно уходит на ревизию премиум-моделью (второй проход). */
const REVISION_CONFIDENCE = 0.75
/** Не запускать ревизию, если «шатких» сообщений в окне меньше этого числа. */
const REVISION_MIN_WEAK = 2

const GREETING_RE = /здравствуй|добрый день|добрый вечер|доброе утро|приветству|здрав[еи]й|hello|hi\b/i
/** Часов паузы, после которых окно считаем потенциально новой темой (для дешёвого пути). */
const NEW_TOPIC_PAUSE_HOURS = 6

// ─── Извлечение «жёстких» сущностей ──────────────────────────────────────────
// Именно они (а не общая лексика) дают детерминированный сигнал принадлежности:
// сумма, артикул/маркировка, номер заказа/счёта, адрес объекта.

const AMOUNT_RE = /(\d[\d\s]{2,}(?:[.,]\d+)?)\s?(?:₽|руб|р\.)|(?<!\d)\d{4,}(?!\d)/gi
/** Артикулы/маркировки: С21, RAL 8017, JCB 8025, №7 — буква(ы)+цифры или код после №. */
const CODE_RE = /(?:№\s?\d+)|(?:\b[A-ZА-Я]{1,4}[- ]?\d{2,5}\b)/g
/** Адрес объекта: «ул. Гаражная 14», «г. Пушкино», «на Ярославском шоссе». */
const ADDRESS_RE = /(?:\bг\.\s?|\bул\.\s?|\bпр-т\s?|\bшоссе\s)[А-ЯЁ][а-яё-]+(?:\s?\d+)?|\b[А-ЯЁ][а-яё-]+(?:ое|ском|ском)\s+шоссе\b/g

function normalizeEntity(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, " ")
}

export function extractAmounts(text: string): string[] {
  const found = new Set<string>()
  for (const m of text.matchAll(AMOUNT_RE)) {
    const v = (m[0] ?? "").trim()
    if (v) found.add(v)
  }
  return [...found].slice(0, 6)
}

/** Коды/артикулы/адреса — «объекты» профиля нити. */
export function extractObjects(text: string): string[] {
  const found = new Set<string>()
  for (const re of [CODE_RE, ADDRESS_RE]) {
    for (const m of text.matchAll(re)) {
      const v = (m[0] ?? "").trim()
      if (v && v.length >= 3) found.add(v)
    }
  }
  return [...found].slice(0, 6)
}

/**
 * Числовое ядро суммы — «57600 руб», «57 600 ₽» и «57600» это одна сущность.
 * Нужно, чтобы детерминированный матч не зависел от формы записи.
 */
function amountCore(v: string): string {
  return v.replace(/[^\d]/g, "")
}

/**
 * Детерминированный матч по жёстким сущностям: сообщение принадлежит нити X,
 * если его сумма/код/адрес встречается в профиле X и НИ В ОДНОЙ другой
 * открытой нити. Пересечения (сущность есть у двух нитей) сигналом не
 * считаются — только уникальные.
 *
 * ГОТЧА: раньше здесь пробовали матч по пересечению ключевых слов
 * (profileJson.keyPhrases). На адверсарном тесте это роняло чистоту с 77% до
 * 43-60%: общая деловая лексика («доставка», «оплата», «счёт») встречается во
 * всех сделках и ложно склеивает их. Матчим только цифры/коды/адреса.
 */
function matchByEntities(text: string, threads: RopDealThread[]): RopDealThread | null {
  const amounts = new Set(extractAmounts(text).map(amountCore).filter((v) => v.length >= 3))
  const objects = new Set(extractObjects(text).map(normalizeEntity))
  if (!amounts.size && !objects.size) return null

  const hits: { thread: RopDealThread; score: number }[] = []
  for (const t of threads) {
    const p = threadProfile(t)
    const tAmounts = new Set(p.amounts.map(amountCore).filter(Boolean))
    const tObjects = new Set([...p.objects, ...p.products].map(normalizeEntity))
    let score = 0
    for (const a of amounts) if (tAmounts.has(a)) score += 2
    for (const o of objects) if (tObjects.has(o)) score += 2
    if (score > 0) hits.push({ thread: t, score })
  }
  if (hits.length !== 1) return null // ноль совпадений или неоднозначность — пусть решает AI
  return hits[0].thread
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

/**
 * Погасить актуальную привязку сообщения (ревизия): supersededById ссылается на
 * НОВУЮ привязку. Порядок важен — partial unique index допускает ровно одну
 * строку с supersededById IS NULL на сообщение, поэтому сначала гасим старую.
 */
async function supersedeLink(messageId: string, newLinkPlaceholder: string): Promise<void> {
  await db
    .update(ropMessageDealLinks)
    .set({ supersededById: newLinkPlaceholder })
    .where(and(eq(ropMessageDealLinks.messageId, messageId), sql`${ropMessageDealLinks.supersededById} IS NULL`))
}

async function markPending(messageId: string): Promise<void> {
  await db.update(ropMessages).set({ attributionStatus: "pending" }).where(eq(ropMessages.id, messageId))
}

// ─── Контракт AI-разметки окна ───────────────────────────────────────────────

interface WindowAssignment {
  n: number
  deal: string // метка существующей нити (T1..Tn) | ключ новой сделки (N1..) | SMALL_TALK
  confidence: number
  evidence?: string
}

interface NewDealDecl {
  key: string
  title: string
  products?: string[]
  amounts?: string[]
  objects?: string[]
}

interface WindowOutput {
  assignments: WindowAssignment[]
  new_deals?: NewDealDecl[]
}

// ВАЖЕН ПОРЯДОК ПОЛЕЙ: new_deals объявлен ПЕРЕД assignments намеренно — модель
// генерирует поля в порядке схемы, и при упоре в max_tokens обрезается хвост.
// Потерять кусок assignments не страшно (недостающие уйдут в pending), а потеря
// new_deals обесценивает ВСЁ окно: метки N1/N2 становятся нерезолвимыми и в
// pending падает всё окно целиком (ровно этот баг ловился на realistic-сценарии).
const WINDOW_SCHEMA = {
  type: "object" as const,
  properties: {
    new_deals: {
      type: "array",
      description: "Новые сделки, которых нет среди перечисленных. Объявляй ТОЛЬКО если тема реально новая.",
      items: {
        type: "object",
        properties: {
          key: { type: "string", description: "N1, N2, ... — ссылка из assignments.deal" },
          title: { type: "string", description: "Короткое название, напр. 'Поставка профнастила'." },
          products: { type: "array", items: { type: "string" } },
          amounts: { type: "array", items: { type: "string" } },
          objects: { type: "array", items: { type: "string" }, description: "Адрес/артикул/номер заказа." },
        },
        required: ["key", "title"],
      },
    },
    assignments: {
      type: "array",
      description: "По одному элементу на КАЖДОЕ сообщение окна, в том же порядке.",
      items: {
        type: "object",
        properties: {
          n: { type: "number", description: "Номер сообщения из окна (как в разметке [n])." },
          deal: {
            type: "string",
            description:
              "Метка сделки: T1/T2/... — одна из перечисленных открытых сделок; N1/N2/... — новая сделка, " +
              "объявленная в new_deals; SMALL_TALK — реплика вне сделок (чистое приветствие/благодарность без темы).",
          },
          confidence: { type: "number", description: "0..1 — насколько уверенно сообщение относится к этой сделке." },
          evidence: { type: "string", description: "Очень кратко: на что опирался (товар/сумма/адрес/кому отвечает)." },
        },
        required: ["n", "deal", "confidence"],
      },
    },
  },
  required: ["new_deals", "assignments"],
}

function formatCandidateThreads(threads: RopDealThread[], labelById: Map<string, string>): string {
  if (!threads.length) return "(открытых сделок у контрагента пока нет — все темы окна будут новыми)"
  return threads
    .map((t) => {
      const p = threadProfile(t)
      const parts = [
        `товары/услуги=[${p.products.join(", ")}]`,
        p.objects.length ? `объекты=[${p.objects.join(", ")}]` : "",
        p.amounts.length ? `суммы=[${p.amounts.slice(-6).join(", ")}]` : "",
        p.participants.length ? `участники=[${p.participants.slice(-4).join(", ")}]` : "",
        p.lastSnippets.length ? `последняя реплика="${(p.lastSnippets.at(-1) ?? "").slice(0, 120)}"` : "",
      ].filter(Boolean)
      return `${labelById.get(t.id)}: "${t.title ?? "без названия"}" ${parts.join(" ")}`
    })
    .join("\n")
}

function formatMessageLine(m: RopMessage, masked: string, prefix: string): string {
  const who = m.isOurs ? "МЫ" : "КЛИЕНТ"
  const name = m.authorName ? ` ${m.authorName}` : ""
  const time = m.sentAt.toISOString().replace("T", " ").slice(5, 16)
  return `${prefix} [${time}] ${who}${name}: ${masked || "(без текста)"}`
}

const WINDOW_SYSTEM =
  "Ты разбираешь переписку отдела продаж. В ОДНОМ чате параллельно и вперемешку обсуждаются несколько разных сделок " +
  "(разные товары/услуги, разные объекты, разные суммы, иногда разные люди со стороны клиента). " +
  "Тебе дают окно сообщений — размечай КАЖДОЕ сообщение окна: к какой сделке оно относится.\n\n" +
  "Правила разметки:\n" +
  "1. Соседние по времени сообщения ЧАСТО относятся к РАЗНЫМ сделкам — не наследуй метку у предыдущего сообщения по инерции.\n" +
  "2. Короткую малоинформативную реплику («да», «хорошо», «а когда?», «спасибо») относи к той сделке, на реплику которой она " +
  "   ОТВЕЧАЕТ: ищи выше последнее сообщение противоположной стороны, к которому она подходит по смыслу (вопрос→ответ, цена→реакция).\n" +
  "3. Опирайся на содержание: товар/услуга, сумма, адрес/объект, артикул, имя участника со стороны клиента. Разные суммы и разные " +
  "   объекты — почти всегда разные сделки.\n" +
  "4. Если у одной сделки свой человек со стороны клиента, реплики этого человека — его сделка.\n" +
  "5. SMALL_TALK ставь редко — только для реплик, вообще не относящихся ни к какой сделке.\n" +
  "6. Не плоди новые сделки: если тема совпадает с уже открытой — используй её метку."

async function classifyWindow(args: {
  companyId: string
  contextLines: string[]
  windowMessages: RopMessage[]
  maskedWindow: string[]
  openThreads: RopDealThread[]
  labelById: Map<string, string>
  tier: "fast" | "premium"
  revision: boolean
  previousLabels?: string[]
}): Promise<{ out: WindowOutput; tokens: number }> {
  await checkBudget(args.companyId, "anthropic_tokens")

  const windowBlock = args.windowMessages
    .map((m, i) => {
      const prev = args.revision && args.previousLabels?.[i] ? ` (черновая метка: ${args.previousLabels[i]})` : ""
      return formatMessageLine(m, args.maskedWindow[i], `[${i + 1}]`) + prev
    })
    .join("\n")

  const contextBlock = args.contextLines.length
    ? `Уже размеченные сообщения этого чата (для контекста, переразмечать НЕ нужно):\n${args.contextLines.join("\n")}\n\n`
    : ""

  const revisionNote = args.revision
    ? "\nЭто ВТОРОЙ проход (ревизия). Черновые метки могли «слипнуться» по инерции — перепроверь каждое сообщение " +
      "по содержанию и по тому, на какую реплику оно отвечает, и при необходимости исправь.\n"
    : ""

  const out = await callWithTool<WindowOutput>({
    toolName: "save_window_attribution",
    schema: WINDOW_SCHEMA,
    system: WINDOW_SYSTEM,
    user:
      `Открытые сделки этого контрагента:\n${formatCandidateThreads(args.openThreads, args.labelById)}\n\n` +
      contextBlock +
      `Окно для разметки (${args.windowMessages.length} сообщений):\n${windowBlock}\n` +
      revisionNote +
      `\nВызови save_window_attribution и верни ровно ${args.windowMessages.length} элементов assignments — по одному на каждый номер [1..${args.windowMessages.length}].\n` +
      `В assignments.deal допустимы ТОЛЬКО: метки открытых сделок выше (${[...args.labelById.values()].join(", ") || "их нет"}), ` +
      `ключи новых сделок, которые ты объявил в new_deals (N1, N2, ...), либо SMALL_TALK. Каждая новая сделка ОБЯЗАНА быть объявлена в new_deals.`,
    modelTier: args.tier,
    // ~160 токенов на сообщение (метка + confidence + короткое evidence) + запас
    // под токенизатор Sonnet 5 и объявления new_deals. Обрезание ответа по
    // max_tokens ломает разметку окна целиком, поэтому запас щедрый.
    maxTokens: Math.min(6000, 800 + args.windowMessages.length * 160),
    companyId: args.companyId,
    action: args.revision ? "deal_attribution_revision" : "deal_attribution_window",
  })
  return { out: out.result, tokens: out.inputTokens + out.outputTokens }
}

// ─── Применение разметки окна ────────────────────────────────────────────────

interface WindowApplyStats {
  linked: number
  newDeals: number
  smallTalk: number
  pending: number
}

/** Разобрать метку модели в id нити (создавая теневую при необходимости). */
async function resolveDealLabel(args: {
  companyId: string
  counterpartyId: string
  label: string
  labelToThreadId: Map<string, string>
  newDeals: Map<string, NewDealDecl>
  createdNew: Map<string, string>
  confidence: number
}): Promise<{ threadId: string | null; created: boolean }> {
  const label = (args.label ?? "").trim()
  if (!label || label.toUpperCase() === "SMALL_TALK") return { threadId: null, created: false }

  const existing = args.labelToThreadId.get(label.toUpperCase()) ?? args.labelToThreadId.get(label)
  if (existing) return { threadId: existing, created: false }

  const already = args.createdNew.get(label.toUpperCase())
  if (already) return { threadId: already, created: false }

  const decl = args.newDeals.get(label.toUpperCase())
  if (!decl) return { threadId: null, created: false }
  if (args.confidence < NEW_DEAL_MIN_CONFIDENCE) return { threadId: null, created: false }

  const created = await createShadowThread({
    companyId: args.companyId,
    counterpartyId: args.counterpartyId,
    title: decl.title,
    confidence: args.confidence,
    profile: {
      products: decl.products ?? [],
      amounts: decl.amounts ?? [],
      objects: decl.objects ?? [],
    },
  })
  args.createdNew.set(label.toUpperCase(), created.id)
  return { threadId: created.id, created: true }
}

/** Дописать в профиль нити жёсткие сущности сообщения + снимок последней реплики. */
async function enrichProfile(threadId: string, message: RopMessage): Promise<void> {
  const text = message.text ?? ""
  const patch: DealThreadProfilePatch = {
    amounts: extractAmounts(text),
    objects: extractObjects(text),
    participants: message.isOurs ? [] : [message.authorName || message.authorExternalId || ""].filter(Boolean),
    lastSnippets: text ? [text.slice(0, 200)] : [],
  }
  await patchThreadProfile(threadId, patch)
}

// ─── Основной проход по треду ────────────────────────────────────────────────

/** Хвост уже размеченных сообщений треда — как контекст для следующего окна. */
async function loadAttributedContext(
  companyId: string,
  threadKey: string,
  beforeSentAt: Date,
  labelById: Map<string, string>,
  limit = CONTEXT_SIZE
): Promise<string[]> {
  const rows = await db
    .select({
      id: ropMessages.id,
      sentAt: ropMessages.sentAt,
      text: ropMessages.text,
      authorName: ropMessages.authorName,
      authorExternalId: ropMessages.authorExternalId,
      isOurs: ropMessages.isOurs,
      dealThreadId: ropMessageDealLinks.dealThreadId,
    })
    .from(ropMessages)
    .innerJoin(
      ropMessageDealLinks,
      and(eq(ropMessageDealLinks.messageId, ropMessages.id), sql`${ropMessageDealLinks.supersededById} IS NULL`)
    )
    .where(and(eq(ropMessages.companyId, companyId), eq(ropMessages.threadKey, threadKey), lt(ropMessages.sentAt, beforeSentAt)))
    .orderBy(desc(ropMessages.sentAt))
    .limit(limit)

  const ordered = rows.reverse()
  const masked = await Promise.all(ordered.map((r) => maskPIIFull(r.text ?? "")))
  return ordered.map((r, i) => {
    const who = r.isOurs ? "МЫ" : "КЛИЕНТ"
    const name = r.authorName ? ` ${r.authorName}` : ""
    const time = r.sentAt.toISOString().replace("T", " ").slice(5, 16)
    const label = labelById.get(r.dealThreadId) ?? "?"
    return `(${label}) [${time}] ${who}${name}: ${(masked[i] || "").slice(0, 200)}`
  })
}

/**
 * Признаки того, что окно может содержать НОВУЮ тему — тогда дешёвый путь
 * «единственная открытая нить» неприменим и нужен AI.
 */
function windowLooksLikeNewTopic(windowMessages: RopMessage[], lastContextAt: Date | null, openThreads: RopDealThread[]): boolean {
  if (!openThreads.length) return true
  const known = new Set(
    openThreads.flatMap((t) => threadProfile(t).participants.map(normalizeEntity))
  )
  for (const [i, m] of windowMessages.entries()) {
    const text = m.text ?? ""
    if (GREETING_RE.test(text)) return true
    const who = normalizeEntity(m.authorName || m.authorExternalId || "")
    if (!m.isOurs && who && known.size > 0 && !known.has(who)) return true
    const prevAt = i === 0 ? lastContextAt : windowMessages[i - 1].sentAt
    if (prevAt && (m.sentAt.getTime() - prevAt.getTime()) / 3_600_000 > NEW_TOPIC_PAUSE_HOURS) return true
  }
  return false
}

async function processWindow(args: {
  companyId: string
  counterpartyId: string
  threadKey: string
  windowMessages: RopMessage[]
  lastContextAt: Date | null
}): Promise<{ stats: WindowApplyStats; tokens: number; aiCalls: number; revisionCalls: number }> {
  const { companyId, counterpartyId, threadKey, windowMessages } = args
  const stats: WindowApplyStats = { linked: 0, newDeals: 0, smallTalk: 0, pending: 0 }
  let tokens = 0
  let aiCalls = 0
  let revisionCalls = 0

  const openThreads = await findOpenThreadsForCounterparty(companyId, counterpartyId)
  const labelById = new Map<string, string>()
  const labelToThreadId = new Map<string, string>()
  openThreads.forEach((t, i) => {
    const label = `T${i + 1}`
    labelById.set(t.id, label)
    labelToThreadId.set(label, t.id)
  })

  // Шаг 2-3: дешёвые детерминированные пути ДО AI.
  const remaining: RopMessage[] = []
  const cheapLinked = new Map<string, string>() // messageId → threadId (для контекста окна)
  const singleThreadPath =
    openThreads.length === 1 && !windowLooksLikeNewTopic(windowMessages, args.lastContextAt, openThreads)

  for (const m of windowMessages) {
    if (singleThreadPath) {
      cheapLinked.set(m.id, openThreads[0].id)
      continue
    }
    if (openThreads.length > 1) {
      const hit = matchByEntities(m.text ?? "", openThreads)
      if (hit) {
        cheapLinked.set(m.id, hit.id)
        continue
      }
    }
    remaining.push(m)
  }

  for (const m of windowMessages) {
    const cheap = cheapLinked.get(m.id)
    if (!cheap) continue
    await createLink({
      companyId,
      messageId: m.id,
      dealThreadId: cheap,
      confidence: 0.85,
      method: "heuristic_single_open",
    })
    await enrichProfile(cheap, m)
    stats.linked++
  }

  if (!remaining.length) return { stats, tokens, aiCalls, revisionCalls }

  const contextLines = await loadAttributedContext(companyId, threadKey, remaining[0].sentAt, labelById)
  const masked = await Promise.all(remaining.map((m) => maskPIIFull(m.text ?? "")))
  const tier: "fast" | "premium" = openThreads.length > ESCALATE_THREAD_COUNT ? "premium" : "fast"

  let result: { out: WindowOutput; tokens: number }
  try {
    result = await classifyWindow({
      companyId,
      contextLines,
      windowMessages: remaining,
      maskedWindow: masked,
      openThreads,
      labelById,
      tier,
      revision: false,
    })
    aiCalls++
    tokens += result.tokens
  } catch (e) {
    console.warn(`[salesradar/attribution] разметка окна не удалась (${(e as Error).message}) → pending`)
    for (const m of remaining) {
      await markPending(m.id)
      stats.pending++
    }
    return { stats, tokens, aiCalls, revisionCalls }
  }

  let assignments = normalizeAssignments(result.out, remaining.length)
  let newDeals = declaredNewDeals(result.out)

  // Страховка от «нерезолвимой» разметки: модель сослалась на метки, которых нет
  // ни среди открытых нитей, ни среди объявленных new_deals (обрыв ответа,
  // самопридуманные ярлыки). Молча это уронило бы всё окно в pending — вместо
  // этого один повтор вызова с явным напоминанием про метки.
  const unresolved = countUnresolvable(assignments, labelToThreadId, newDeals)
  if (unresolved > remaining.length / 3) {
    console.warn(
      `[salesradar/attribution] окно ${threadKey}: ${unresolved}/${remaining.length} меток не резолвятся, повтор разметки`
    )
    try {
      const retry = await classifyWindow({
        companyId, contextLines, windowMessages: remaining, maskedWindow: masked,
        openThreads, labelById, tier, revision: false,
      })
      aiCalls++
      tokens += retry.tokens
      const retryAssignments = normalizeAssignments(retry.out, remaining.length)
      const retryNewDeals = declaredNewDeals(retry.out)
      if (countUnresolvable(retryAssignments, labelToThreadId, retryNewDeals) < unresolved) {
        assignments = retryAssignments
        newDeals = retryNewDeals
      }
    } catch (e) {
      console.warn(`[salesradar/attribution] повтор разметки окна не удался: ${(e as Error).message}`)
    }
  }

  // Шаг 5: ревизия — если модель сама не уверена в нескольких сообщениях окна.
  const weak = assignments.filter((a) => !a || a.confidence < REVISION_CONFIDENCE).length
  if (weak >= REVISION_MIN_WEAK) {
    try {
      const revised = await classifyWindow({
        companyId,
        contextLines,
        windowMessages: remaining,
        maskedWindow: masked,
        openThreads,
        labelById,
        tier: "premium",
        revision: true,
        previousLabels: assignments.map((a) => a?.deal ?? "?"),
      })
      revisionCalls++
      tokens += revised.tokens
      const revisedAssignments = normalizeAssignments(revised.out, remaining.length)
      // Ревизия принимается только если она полная (по элементу на сообщение).
      if (revisedAssignments.every(Boolean)) {
        assignments = revisedAssignments
        newDeals = new Map([...newDeals, ...declaredNewDeals(revised.out)])
      }
    } catch (e) {
      console.warn(`[salesradar/attribution] ревизия окна не удалась (${(e as Error).message}), берём первый проход`)
    }
  }

  const createdNew = new Map<string, string>()
  for (const [i, m] of remaining.entries()) {
    const a = assignments[i]
    if (!a || a.confidence < PENDING_MAX_CONFIDENCE) {
      await markPending(m.id)
      stats.pending++
      continue
    }
    const label = (a.deal ?? "").trim().toUpperCase()
    if (label === "SMALL_TALK") {
      await db.update(ropMessages).set({ attributionStatus: "skipped" }).where(eq(ropMessages.id, m.id))
      stats.smallTalk++
      continue
    }
    const { threadId, created } = await resolveDealLabel({
      companyId,
      counterpartyId,
      label: a.deal,
      labelToThreadId,
      newDeals,
      createdNew,
      confidence: a.confidence,
    })
    if (!threadId) {
      await markPending(m.id)
      stats.pending++
      continue
    }
    if (created) {
      stats.newDeals++
      // Новая нить должна быть доступна как кандидат следующим окнам.
      const label2 = `T${labelById.size + 1}`
      labelById.set(threadId, label2)
      labelToThreadId.set(label2, threadId)
    }
    await createLink({
      companyId,
      messageId: m.id,
      dealThreadId: threadId,
      confidence: a.confidence,
      method: "ai",
      modelVersion: tier,
      evidence: a.evidence ?? null,
    })
    await enrichProfile(threadId, m)
    stats.linked++
  }

  return { stats, tokens, aiCalls, revisionCalls }
}

/** Разложить assignments модели по позициям окна (модель может путать порядок/пропускать). */
function normalizeAssignments(out: WindowOutput, size: number): (WindowAssignment | null)[] {
  const byIndex: (WindowAssignment | null)[] = Array.from({ length: size }, () => null)
  for (const a of out.assignments ?? []) {
    const n = Number(a?.n)
    if (!Number.isFinite(n)) continue
    const idx = n - 1
    if (idx < 0 || idx >= size) continue
    byIndex[idx] = { n, deal: String(a.deal ?? ""), confidence: Number(a.confidence ?? 0), evidence: a.evidence }
  }
  return byIndex
}

/** Сколько меток окна не сопоставимы ни с открытой нитью, ни с объявленной новой сделкой. */
function countUnresolvable(
  assignments: (WindowAssignment | null)[],
  labelToThreadId: Map<string, string>,
  newDeals: Map<string, NewDealDecl>
): number {
  let n = 0
  for (const a of assignments) {
    if (!a) {
      n++
      continue
    }
    const label = (a.deal ?? "").trim().toUpperCase()
    if (!label) { n++; continue }
    if (label === "SMALL_TALK") continue
    if (labelToThreadId.has(label) || newDeals.has(label)) continue
    n++
  }
  return n
}

function declaredNewDeals(out: WindowOutput): Map<string, NewDealDecl> {
  const map = new Map<string, NewDealDecl>()
  for (const d of out.new_deals ?? []) {
    const key = (d?.key ?? "").trim().toUpperCase()
    if (!key || !d.title) continue
    map.set(key, d)
  }
  return map
}

/**
 * Обработать пачку pending-сообщений одной компании: группировка по threadKey,
 * внутри треда — окна по WINDOW_SIZE в хронологическом порядке.
 * budgetMs — мягкий таймбюджет для крона (по образцу ai-rop-import).
 */
export async function attributeCompanyMessages(
  companyId: string,
  opts: { limit?: number; budgetMs?: number; windowSize?: number } = {}
): Promise<AttributionResult> {
  const limit = opts.limit ?? 200
  const budgetMs = opts.budgetMs ?? 40_000
  const windowSize = opts.windowSize ?? WINDOW_SIZE
  const t0 = Date.now()

  const pending = await db
    .select()
    .from(ropMessages)
    .where(and(eq(ropMessages.companyId, companyId), eq(ropMessages.attributionStatus, "pending")))
    .orderBy(asc(ropMessages.threadKey), asc(ropMessages.sentAt))
    .limit(limit)

  const result: AttributionResult = {
    processed: 0, linked: 0, newDeals: 0, smallTalk: 0, pending: 0, aiCalls: 0, gateAiCalls: 0, tokensSpent: 0,
  }

  // Группируем по треду — окно имеет смысл только внутри одного чата.
  const byThread = new Map<string, RopMessage[]>()
  for (const m of pending) {
    const arr = byThread.get(m.threadKey) ?? []
    arr.push(m)
    byThread.set(m.threadKey, arr)
  }

  for (const [threadKey, messages] of byThread) {
    if (Date.now() - t0 > budgetMs) break

    // Сообщения без опознанного контрагента каскад разобрать не может — ждём
    // identity resolution (ingest.ts, зона другого агента).
    const identified = messages.filter((m) => m.counterpartyId)
    for (const m of messages) {
      if (!m.counterpartyId) {
        await markPending(m.id)
        result.processed++
        result.pending++
      }
    }
    if (!identified.length) continue

    let lastContextAt: Date | null = null
    const [prevRow] = await db
      .select({ sentAt: ropMessages.sentAt })
      .from(ropMessages)
      .where(
        and(
          eq(ropMessages.companyId, companyId),
          eq(ropMessages.threadKey, threadKey),
          lte(ropMessages.sentAt, identified[0].sentAt),
          eq(ropMessages.attributionStatus, "linked")
        )
      )
      .orderBy(desc(ropMessages.sentAt))
      .limit(1)
    lastContextAt = prevRow?.sentAt ?? null

    for (let i = 0; i < identified.length; i += windowSize) {
      if (Date.now() - t0 > budgetMs) break
      const windowMessages = identified.slice(i, i + windowSize)
      // Контрагент внутри одного threadKey как правило один; берём его у первого
      // сообщения окна, остальные сообщения окна с другим контрагентом
      // обрабатываются следующим проходом крона (редчайший случай групповых чатов).
      const counterpartyId = windowMessages[0].counterpartyId as string
      const sameCp = windowMessages.filter((m) => m.counterpartyId === counterpartyId)

      const r = await processWindow({ companyId, counterpartyId, threadKey, windowMessages: sameCp, lastContextAt })
      result.processed += sameCp.length
      result.linked += r.stats.linked
      result.newDeals += r.stats.newDeals
      result.smallTalk += r.stats.smallTalk
      result.pending += r.stats.pending
      result.aiCalls += r.aiCalls
      result.gateAiCalls += r.revisionCalls
      result.tokensSpent += r.tokens

      lastContextAt = sameCp.at(-1)?.sentAt ?? lastContextAt
    }
  }

  return result
}

// Экспортируется для будущей ручной переклассификации из UI (Ф2): гасит
// актуальную привязку и ставит новую method='manual'.
export async function reattributeMessageManually(args: {
  companyId: string
  messageId: string
  dealThreadId: string
}): Promise<void> {
  const [created] = await db
    .insert(ropMessageDealLinks)
    .values({
      companyId: args.companyId,
      messageId: null, // временно null: сначала гасим старую, чтобы не нарушить partial unique
      dealThreadId: args.dealThreadId,
      confidence: "1",
      method: "manual",
    })
    .returning({ id: ropMessageDealLinks.id })
  await supersedeLink(args.messageId, created.id)
  await db.update(ropMessageDealLinks).set({ messageId: args.messageId }).where(eq(ropMessageDealLinks.id, created.id))
  await db.update(ropMessages).set({ attributionStatus: "linked" }).where(eq(ropMessages.id, args.messageId))
}
