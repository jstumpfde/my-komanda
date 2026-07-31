/**
 * scripts/test-salesradar-attribution.ts
 *
 * Синтетическая проверка оконной разметки attribution.ts + rollup.ts (раздел B
 * плана SalesRadar): создаёт в ЛОКАЛЬНОЙ dev-БД тестовую компанию, коннектор,
 * контрагента и один "чат", где вперемешку обсуждаются несколько сделок,
 * прогоняет attributeCompanyMessages() + rollupCompanyMessages() и печатает,
 * как разложилось: сколько нитей создано, куда попало каждое сообщение,
 * чистота привязки, средняя уверенность, потраченные токены.
 *
 * Два сценария:
 *   adversarial (по умолчанию) — 30 сообщений, 3 сделки строго round-robin,
 *     без пауз и приветствий между темами: худший случай, «стресс-тест».
 *   realistic — 34 сообщения, 4 сделки блоками с паузами, приветствиями и
 *     длинными информативными репликами: близко к живой переписке.
 *
 * НЕ идемпотентно по дизайну (каждый запуск — новая тестовая компания),
 * поэтому в конце скрипт сам подчищает за собой (companies.id CASCADE
 * удаляет весь salesradar-след через FK onDelete:cascade).
 *
 *   pnpm exec tsx --env-file=.env.local scripts/test-salesradar-attribution.ts
 *   ... scripts/test-salesradar-attribution.ts --scenario=realistic
 *   ... scripts/test-salesradar-attribution.ts --runs=3
 *   ... scripts/test-salesradar-attribution.ts --keep   (не удалять компанию)
 */
import { eq } from "drizzle-orm"
import { db, pgClient } from "@/lib/db"
import {
  companies,
  ropChannelConnectors,
  ropCounterparties,
  ropMessages,
  ropDealThreads,
  ropMessageDealLinks,
  ropCalls,
} from "@/lib/db/schema"
import { attributeCompanyMessages } from "@/lib/salesradar/attribution"
import { rollupCompanyMessages } from "@/lib/salesradar/rollup"
import { getThread, threadProfile } from "@/lib/salesradar/threads"

const KEEP = process.argv.includes("--keep")
const SCENARIO_ARG = (process.argv.find((a) => a.startsWith("--scenario=")) ?? "").split("=")[1] || "adversarial"
const RUNS = Number((process.argv.find((a) => a.startsWith("--runs=")) ?? "").split("=")[1] || "1")
const VERBOSE = process.argv.includes("--verbose")

function log(...parts: unknown[]) {
  console.log(`[${new Date().toISOString()}]`, ...parts)
}

/** gapMin — пауза до предыдущего сообщения в минутах (по умолчанию 2-4 мин). */
type Seed = { deal: string; isOurs: boolean; text: string; author: string; gapMin?: number }

// ─── Сценарий A: adversarial ────────────────────────────────────────────────
// Три сделки, реально перемешанные в одном чате round-robin, без пауз и
// приветствий на стыках — худший случай для любой sticky-эвристики.
const SEED_ADVERSARIAL: Seed[] = [
  { deal: "profnastil", isOurs: false, text: "Здравствуйте! Подскажите, есть в наличии профнастил С21 в цвете RAL 8017?", author: "Иван (клиент)" },
  { deal: "profnastil", isOurs: true, text: "Добрый день, Иван! Да, есть, по 480 руб/м2. Сколько метров нужно?", author: "Менеджер Аня" },
  { deal: "krovlya", isOurs: false, text: "Здравствуйте, а у вас можно заказать ремонт кровли гаража, 40 квадратов?", author: "Пётр (клиент)" },
  { deal: "profnastil", isOurs: false, text: "Нужно примерно 120 метров, для забора на даче в Пушкино", author: "Иван (клиент)" },
  { deal: "krovlya", isOurs: true, text: "Здравствуйте, Пётр! Да, делаем. Какая крыша — плоская или скатная, есть протечки?", author: "Менеджер Аня" },
  { deal: "profnastil", isOurs: true, text: "Отлично, тогда сумма получится около 57600 руб с доставкой по Пушкино", author: "Менеджер Аня" },
  { deal: "arenda", isOurs: false, text: "Добрый день! Нужна в аренду мини-экскаватор на 3 дня, объект в Королёве", author: "Сергей (клиент)" },
  { deal: "krovlya", isOurs: false, text: "Скатная, шифер местами треснул, протечек пока нет", author: "Пётр (клиент)" },
  { deal: "arenda", isOurs: true, text: "Добрый день, Сергей! Мини-экскаватор JCB 8025 — 4500 руб/сутки, итого 13500 за 3 дня", author: "Менеджер Аня" },
  { deal: "profnastil", isOurs: false, text: "Хорошо, а когда можно забрать со склада?", author: "Иван (клиент)" },
  { deal: "krovlya", isOurs: true, text: "Тогда предлагаем частичную замену листов, смета выйдет около 95000 руб за 40м2 с работой", author: "Менеджер Аня" },
  { deal: "arenda", isOurs: false, text: "А доставка экскаватора до Королёва входит в стоимость?", author: "Сергей (клиент)" },
  { deal: "profnastil", isOurs: true, text: "Завтра после 12:00, склад на Ярославском шоссе", author: "Менеджер Аня" },
  { deal: "krovlya", isOurs: false, text: "95000 многовато, а если только герметизацию сделать без полной замены?", author: "Пётр (клиент)" },
  { deal: "arenda", isOurs: true, text: "Доставка отдельно, 2500 руб в одну сторону по Королёву", author: "Менеджер Аня" },
  { deal: "profnastil", isOurs: false, text: "Понял, спасибо! Оплата картой при получении возможна?", author: "Иван (клиент)" },
  { deal: "krovlya", isOurs: true, text: "Герметизация выйдет дешевле, около 35000 руб, но гарантия меньше — на сезон", author: "Менеджер Аня" },
  { deal: "arenda", isOurs: false, text: "Хорошо, тогда оформляем на 3 дня с доставкой, итого 16000", author: "Сергей (клиент)" },
  { deal: "profnastil", isOurs: true, text: "Да, картой на складе принимаем", author: "Менеджер Аня" },
  { deal: "krovlya", isOurs: false, text: "Давайте тогда герметизацию, когда сможете приехать на замер?", author: "Пётр (клиент)" },
  { deal: "arenda", isOurs: true, text: "Подтверждаю бронь экскаватора JCB 8025 на понедельник, счёт вышлю сегодня", author: "Менеджер Аня" },
  { deal: "profnastil", isOurs: false, text: "Отлично, тогда завтра заеду за профнастилом", author: "Иван (клиент)" },
  { deal: "krovlya", isOurs: true, text: "В четверг в 14:00 подойдёт замерщик, адрес пришлите пожалуйста", author: "Менеджер Аня" },
  { deal: "arenda", isOurs: false, text: "Спасибо, жду счёт на почту", author: "Сергей (клиент)" },
  { deal: "krovlya", isOurs: false, text: "Адрес: г.Пушкино, ул.Гаражная 14, гараж №7", author: "Пётр (клиент)" },
  { deal: "profnastil", isOurs: true, text: "Ждём вас, счёт на самовывоз оформлю к утру", author: "Менеджер Аня" },
  { deal: "krovlya", isOurs: true, text: "Записал, до четверга!", author: "Менеджер Аня" },
  { deal: "arenda", isOurs: true, text: "Счёт на 16000 руб отправлен на почту, реквизиты внутри", author: "Менеджер Аня" },
  { deal: "profnastil", isOurs: false, text: "Спасибо большое, до встречи!", author: "Иван (клиент)" },
  { deal: "arenda", isOurs: false, text: "Получил, оплачу сегодня же", author: "Сергей (клиент)" },
]

// ─── Сценарий B: realistic ──────────────────────────────────────────────────
// Другая предметная область (мебельное производство), 4 сделки. Темы идут
// блоками с паузами в часы/сутки, начинаются с приветствия, реплики длиннее и
// информативнее, но встречаются и «возвраты» к старой теме через день —
// именно на них ломается наивная группировка по времени.
const SEED_REALISTIC: Seed[] = [
  { deal: "kuhnya", isOurs: false, text: "Добрый день! Хотим заказать кухонный гарнитур в новую квартиру, 4.2 метра по стене, угловой. Интересует МДФ эмаль, светлый цвет. Можно рассчитать примерную стоимость?", author: "Ольга (клиент)", gapMin: 0 },
  { deal: "kuhnya", isOurs: true, text: "Добрый день, Ольга! Да, конечно. По МДФ в эмали угловая кухня 4.2 м выходит ориентировочно 310000 руб без техники, с фурнитурой Blum. Точнее скажем после замера. Куда удобно вызвать замерщика?", author: "Менеджер Аня", gapMin: 25 },
  { deal: "kuhnya", isOurs: false, text: "Квартира на Ленинском, 76. Давайте в субботу утром, если можно.", author: "Ольга (клиент)", gapMin: 40 },
  { deal: "kuhnya", isOurs: true, text: "Записал на субботу 10:00, замерщик Дмитрий позвонит за час. Замер бесплатный, при заказе входит в стоимость.", author: "Менеджер Аня", gapMin: 15 },
  { deal: "shkaf", isOurs: false, text: "Здравствуйте! Отдельно ещё хотела спросить про шкаф-купе в прихожую, ширина 2.4 метра, с зеркалом на одной створке. Это же вы тоже делаете?", author: "Ольга (клиент)", gapMin: 60 * 26 },
  { deal: "shkaf", isOurs: true, text: "Здравствуйте! Да, шкафы-купе делаем. 2.4 м с зеркальной створкой и системой Aristo — примерно 87000 руб. Наполнение (штанга, полки, ящики) считаем отдельно, обычно плюс 12000-18000.", author: "Менеджер Аня", gapMin: 30 },
  { deal: "shkaf", isOurs: false, text: "А сроки какие по шкафу?", author: "Ольга (клиент)", gapMin: 20 },
  { deal: "shkaf", isOurs: true, text: "Производство 18 рабочих дней с момента предоплаты, монтаж один день.", author: "Менеджер Аня", gapMin: 10 },
  { deal: "stoleshnica", isOurs: false, text: "Добрый день! Подскажите, а столешницу из искусственного камня можно заказать у вас отдельно, без кухни? Нужна на остров 2.6 х 1.1 метра.", author: "Артём (клиент)", gapMin: 60 * 20 },
  { deal: "stoleshnica", isOurs: true, text: "Добрый день, Артём! Да, отдельно делаем. Акрил Staron на остров 2.6х1.1 — от 145000 руб с фрезеровкой мойки. Какой оттенок рассматриваете и есть ли уже мойка?", author: "Менеджер Аня", gapMin: 35 },
  { deal: "stoleshnica", isOurs: false, text: "Мойка Blanco, врезная. Оттенок хотим белый с крапинкой.", author: "Артём (клиент)", gapMin: 50 },
  { deal: "kuhnya", isOurs: true, text: "Ольга, замер по кухне сделали, финальная смета 328000 руб — вышло чуть больше из-за выступа короба. Договор пришлю на почту.", author: "Менеджер Аня", gapMin: 60 * 30 },
  { deal: "kuhnya", isOurs: false, text: "Хорошо, присылайте.", author: "Ольга (клиент)", gapMin: 45 },
  { deal: "stoleshnica", isOurs: true, text: "Артём, под Blanco фрезеровку сделаем по шаблону, белый с крапинкой есть в наличии — Staron Sanded Birch. Итог 152000 руб с установкой.", author: "Менеджер Аня", gapMin: 30 },
  { deal: "stoleshnica", isOurs: false, text: "Устраивает. Что нужно для запуска в работу?", author: "Артём (клиент)", gapMin: 60 * 5 },
  { deal: "stoleshnica", isOurs: true, text: "Предоплата 50%, это 76000 руб, и точный шаблон острова. Реквизиты вышлю следом.", author: "Менеджер Аня", gapMin: 15 },
  { deal: "shkaf", isOurs: false, text: "По шкафу решили брать с наполнением — штанга, пять полок и два ящика. Сколько итого получается?", author: "Ольга (клиент)", gapMin: 60 * 14 },
  { deal: "shkaf", isOurs: true, text: "С таким наполнением итог 102000 руб. Если оформляем вместе с кухней, дадим скидку 5% на шкаф — выйдет 96900.", author: "Менеджер Аня", gapMin: 20 },
  { deal: "shkaf", isOurs: false, text: "Отлично, давайте так.", author: "Ольга (клиент)", gapMin: 25 },
  { deal: "kuhnya", isOurs: false, text: "Договор по кухне получила, подписала, отправила скан на вашу почту. Предоплату сделаю завтра.", author: "Ольга (клиент)", gapMin: 60 * 8 },
  { deal: "remont", isOurs: false, text: "Добрый день! У нас на прошлогодней кухне от вас начал проседать один из подъёмных механизмов на верхнем шкафу. Гарантия ещё действует? Заказ был в мае прошлого года на Академическую.", author: "Николай (клиент)", gapMin: 60 * 26 },
  { deal: "remont", isOurs: true, text: "Добрый день, Николай! Гарантия на фурнитуру два года, ваш случай попадает. Пришлите фото механизма и номер заказа, если сохранился — заявку оформим сегодня.", author: "Менеджер Аня", gapMin: 40 },
  { deal: "remont", isOurs: false, text: "Номер заказа 4471, фото прикрепил.", author: "Николай (клиент)", gapMin: 30 },
  { deal: "kuhnya", isOurs: true, text: "Ольга, предоплату по кухне 164000 руб видим, запустили в производство. Срок — 25 рабочих дней, ориентировочно к 20 числу.", author: "Менеджер Аня", gapMin: 60 * 6 },
  { deal: "remont", isOurs: true, text: "Николай, по заказу 4471 всё нашли. Механизм Blum Aventos заменим по гарантии бесплатно, мастер приедет в среду с 12 до 15.", author: "Менеджер Аня", gapMin: 60 * 5 },
  { deal: "remont", isOurs: false, text: "Спасибо, среда подходит.", author: "Николай (клиент)", gapMin: 35 },
  { deal: "stoleshnica", isOurs: false, text: "Предоплату 76000 отправил, шаблон передам замерщику в пятницу.", author: "Артём (клиент)", gapMin: 60 * 12 },
  { deal: "stoleshnica", isOurs: true, text: "Оплата пришла, спасибо! В пятницу подъедет технолог, снимет шаблон острова на месте.", author: "Менеджер Аня", gapMin: 25 },
  { deal: "shkaf", isOurs: true, text: "Ольга, по шкафу-купе счёт на 96900 руб отправила на почту, после оплаты запускаем вместе с кухней.", author: "Менеджер Аня", gapMin: 60 * 10 },
  { deal: "shkaf", isOurs: false, text: "Оплачу сегодня вечером.", author: "Ольга (клиент)", gapMin: 30 },
  { deal: "remont", isOurs: true, text: "Николай, мастер отработал, механизм заменён, акт подписан. Гарантия на новый узел ещё два года.", author: "Менеджер Аня", gapMin: 60 * 30 },
  { deal: "kuhnya", isOurs: false, text: "А по кухне доставка и сборка входят в 328000 или отдельно считаются?", author: "Ольга (клиент)", gapMin: 60 * 4 },
  { deal: "kuhnya", isOurs: true, text: "Доставка по городу входит, подъём и сборка тоже — отдельно оплачивается только техника, если будете брать через нас.", author: "Менеджер Аня", gapMin: 20 },
  { deal: "stoleshnica", isOurs: false, text: "Шаблон сняли, всё ок. Когда ждать монтаж столешницы?", author: "Артём (клиент)", gapMin: 60 * 22 },
]

const SCENARIOS: Record<string, { seed: Seed[]; expectedDeals: number; title: string }> = {
  adversarial: { seed: SEED_ADVERSARIAL, expectedDeals: 3, title: "adversarial (3 сделки round-robin, без пауз/приветствий)" },
  realistic: { seed: SEED_REALISTIC, expectedDeals: 4, title: "realistic (4 сделки блоками, паузы, приветствия, длинные реплики)" },
}

/**
 * Честная чистота: жадное ОДНО-К-ОДНОМУ сопоставление «истинная сделка → нить».
 * Наивная метрика «нить большинства» позволяла засчитать одну и ту же нить
 * сразу двум сделкам и завышала цифру.
 */
function purityOneToOne(pairs: { deal: string; threadId: string | null }[]): { correct: number; total: number; mapping: Map<string, string> } {
  const counts = new Map<string, Map<string, number>>()
  for (const p of pairs) {
    if (!p.threadId) continue
    const m = counts.get(p.deal) ?? new Map<string, number>()
    m.set(p.threadId, (m.get(p.threadId) ?? 0) + 1)
    counts.set(p.deal, m)
  }
  const cells: { deal: string; threadId: string; n: number }[] = []
  for (const [deal, m] of counts) for (const [threadId, n] of m) cells.push({ deal, threadId, n })
  cells.sort((a, b) => b.n - a.n)

  const mapping = new Map<string, string>()
  const usedThreads = new Set<string>()
  let correct = 0
  for (const c of cells) {
    if (mapping.has(c.deal) || usedThreads.has(c.threadId)) continue
    mapping.set(c.deal, c.threadId)
    usedThreads.add(c.threadId)
    correct += c.n
  }
  return { correct, total: pairs.length, mapping }
}

interface RunMetrics {
  purity: number
  threads: number
  tokens: number
  aiCalls: number
  revisionCalls: number
  ms: number
  pendingMsgs: number
  avgConfidence: number
}

async function runOnce(scenarioKey: string, runIdx: number): Promise<RunMetrics> {
  const scenario = SCENARIOS[scenarioKey]
  if (!scenario) throw new Error(`неизвестный сценарий '${scenarioKey}' (есть: ${Object.keys(SCENARIOS).join(", ")})`)
  const SEED = scenario.seed

  log(`прогон #${runIdx}: сценарий ${scenarioKey} — ${scenario.title}, ${SEED.length} сообщений`)

  const [company] = await db.insert(companies).values({ name: `[TEST] SalesRadar attribution ${Date.now()}` }).returning({ id: companies.id })
  const companyId = company.id

  const [connector] = await db
    .insert(ropChannelConnectors)
    .values({ companyId, kind: "telegram_bot", title: "Тестовый TG-чат", mode: "webhook", isEnabled: true, status: "active" })
    .returning({ id: ropChannelConnectors.id })

  const [counterparty] = await db
    .insert(ropCounterparties)
    .values({ companyId, kind: "client", name: "Тестовый клиент (общий чат на несколько сделок)" })
    .returning({ id: ropCounterparties.id })

  const threadKey = `test-chat-${Date.now()}`
  // Отматываем старт назад, чтобы сумма пауз сценария закончилась «сейчас».
  const totalGap = SEED.reduce((acc, s, i) => acc + (s.gapMin ?? 2 + (i % 3)), 0)
  let cursor = Date.now() - totalGap * 60_000
  const insertedIds: string[] = []
  for (const [i, s] of SEED.entries()) {
    cursor += (s.gapMin ?? 2 + (i % 3)) * 60_000
    const [row] = await db
      .insert(ropMessages)
      .values({
        companyId,
        connectorId: connector.id,
        threadKey,
        externalId: `msg-${i}`,
        counterpartyId: counterparty.id,
        direction: s.isOurs ? "out" : "in",
        authorExternalId: s.isOurs ? "manager-anya" : `client-${s.author}`,
        authorName: s.author,
        isOurs: s.isOurs,
        text: s.text,
        sentAt: new Date(cursor),
        attributionStatus: "pending",
      })
      .returning({ id: ropMessages.id })
    insertedIds.push(row.id)
  }

  const t0 = Date.now()
  const attrResult = await attributeCompanyMessages(companyId, { budgetMs: 300_000, limit: 200 })
  const attrMs = Date.now() - t0

  const links = await db
    .select({
      messageId: ropMessageDealLinks.messageId,
      dealThreadId: ropMessageDealLinks.dealThreadId,
      confidence: ropMessageDealLinks.confidence,
      method: ropMessageDealLinks.method,
    })
    .from(ropMessageDealLinks)
    .where(eq(ropMessageDealLinks.companyId, companyId))

  const linkByMsg = new Map(links.filter((l) => l.messageId).map((l) => [l.messageId as string, l]))
  const threads = await db.select().from(ropDealThreads).where(eq(ropDealThreads.companyId, companyId))
  const threadTitleById = new Map(threads.map((t) => [t.id, t.title ?? t.id.slice(0, 8)]))

  const pairs = SEED.map((s, i) => ({ deal: s.deal, threadId: linkByMsg.get(insertedIds[i])?.dealThreadId ?? null }))
  const { correct, total, mapping } = purityOneToOne(pairs)
  const purity = (correct / total) * 100

  console.log("\n=== РАЗБИВКА ПО СООБЩЕНИЯМ (истина vs предсказание) ===")
  for (const [i, s] of SEED.entries()) {
    const link = linkByMsg.get(insertedIds[i])
    const threadLabel = link ? threadTitleById.get(link.dealThreadId) ?? link.dealThreadId.slice(0, 8) : "—"
    const ok = link && mapping.get(s.deal) === link.dealThreadId ? "OK " : "ОШБ"
    if (!VERBOSE && ok === "OK ") continue
    console.log(
      `${ok} #${String(i + 1).padStart(2, "0")} [истина=${s.deal.padEnd(12)}] → "${threadLabel}" method=${link?.method ?? "НЕТ"} conf=${link?.confidence ?? "—"} | "${s.text.slice(0, 45)}..."`
    )
  }

  console.log("\n=== СВОДКА ===")
  console.log(`  Сценарий: ${scenarioKey}`)
  console.log(`  ЧИСТОТА (1:1 сопоставление сделка↔нить) = ${correct}/${total} = ${purity.toFixed(1)}%`)
  console.log(`  Нитей создано: ${threads.length} (ожидалось ~${scenario.expectedDeals})`)
  const confidences = links.map((l) => Number(l.confidence)).filter((c) => !Number.isNaN(c))
  const avgConfidence = confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0
  console.log(`  Средняя уверенность: ${avgConfidence.toFixed(3)}`)
  console.log(
    `  Время: ${attrMs}мс, AI-вызовов окон: ${attrResult.aiCalls}, ревизий: ${attrResult.gateAiCalls}, токенов: ${attrResult.tokensSpent}`
  )
  console.log(`  attribution: ${JSON.stringify(attrResult)}`)

  const rollupResult = await rollupCompanyMessages(companyId, { budgetMs: 30_000 })
  const episodes = await db.select().from(ropCalls).where(eq(ropCalls.tenantId, companyId))
  console.log(`  rollup: ${JSON.stringify(rollupResult)}, эпизодов: ${episodes.length}`)

  console.log("\n=== ПРОФИЛИ НИТЕЙ ===")
  for (const t of threads) {
    const full = await getThread(t.id)
    const p = full ? threadProfile(full) : null
    console.log(`  "${t.title}" (${t.id.slice(0, 8)}): status=${t.status} conf=${t.confidence}`)
    if (p) console.log(`    products=[${p.products.join(", ")}] amounts=[${p.amounts.slice(-6).join(", ")}] objects=[${p.objects.slice(-6).join(", ")}]`)
  }

  if (!KEEP) {
    await db.delete(companies).where(eq(companies.id, companyId))
  } else {
    log(`--keep: компания ${companyId} оставлена`)
  }

  return {
    purity,
    threads: threads.length,
    tokens: attrResult.tokensSpent,
    aiCalls: attrResult.aiCalls,
    revisionCalls: attrResult.gateAiCalls,
    ms: attrMs,
    pendingMsgs: attrResult.pending,
    avgConfidence,
  }
}

async function main() {
  const metrics: RunMetrics[] = []
  for (let i = 1; i <= RUNS; i++) {
    metrics.push(await runOnce(SCENARIO_ARG, i))
  }

  console.log(`\n=== ИТОГ ПО ${RUNS} ПРОГОНАМ (сценарий ${SCENARIO_ARG}) ===`)
  console.log("  #  чистота  нитей  токены  окон  ревизий  pending  время")
  for (const [i, m] of metrics.entries()) {
    console.log(
      `  ${i + 1}  ${m.purity.toFixed(1).padStart(6)}%  ${String(m.threads).padStart(4)}  ${String(m.tokens).padStart(6)}  ${String(m.aiCalls).padStart(4)}  ${String(m.revisionCalls).padStart(6)}  ${String(m.pendingMsgs).padStart(7)}  ${m.ms}мс`
    )
  }
  const avg = (f: (m: RunMetrics) => number) => metrics.reduce((a, m) => a + f(m), 0) / metrics.length
  console.log(
    `  СРЕДНЕЕ: чистота ${avg((m) => m.purity).toFixed(1)}%, нитей ${avg((m) => m.threads).toFixed(1)}, токенов ${avg((m) => m.tokens).toFixed(0)}, окон ${avg((m) => m.aiCalls).toFixed(1)}, ревизий ${avg((m) => m.revisionCalls).toFixed(1)}`
  )
}

main()
  .then(() => {
    log("готово")
    return pgClient.end()
  })
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error("[test-salesradar-attribution] ОШИБКА:", e)
    await pgClient.end().catch(() => {})
    process.exit(1)
  })
