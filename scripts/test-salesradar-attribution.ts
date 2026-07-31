/**
 * scripts/test-salesradar-attribution.ts
 *
 * Синтетическая проверка каскада attribution.ts + rollup.ts (раздел B плана
 * SalesRadar): создаёт в ЛОКАЛЬНОЙ dev-БД тестовую компанию, коннектор,
 * контрагента и один "чат" из ~30 сообщений, где вперемешку обсуждаются 3
 * разные сделки (поставка профнастила / ремонт кровли / аренда техники),
 * прогоняет attributeCompanyMessages() + rollupCompanyMessages() и печатает,
 * как разложилось: сколько нитей создано, куда попало каждое сообщение,
 * средняя уверенность, потраченные токены.
 *
 * НЕ идемпотентно по дизайну (каждый запуск — новая тестовая компания),
 * поэтому в конце скрипт сам подчищает за собой (companies.id CASCADE
 * удаляет весь salesradar-след через FK onDelete:cascade).
 *
 *   pnpm exec tsx --env-file=.env.local scripts/test-salesradar-attribution.ts
 *   pnpm exec tsx --env-file=.env.local scripts/test-salesradar-attribution.ts --keep   (не удалять компанию)
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

function log(...parts: unknown[]) {
  console.log(`[${new Date().toISOString()}]`, ...parts)
}

// Три сделки, реально перемешанные в одном чате с одним и тем же клиентом —
// имитация «в одном чате обсуждают 5-10 сделок» (тут для скорости теста — 3).
// Порядок сообщений НАРОЧНО не сгруппирован по сделке.
type Seed = { deal: "profnastil" | "krovlya" | "arenda"; isOurs: boolean; text: string; author: string }

const SEED: Seed[] = [
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

async function main() {
  log(`старт синтетического теста attribution.ts (${SEED.length} сообщений, 3 сделки перемешаны в одном чате), keep=${KEEP}`)

  const [company] = await db.insert(companies).values({ name: `[TEST] SalesRadar attribution ${Date.now()}` }).returning({ id: companies.id })
  const companyId = company.id
  log(`тестовая компания создана: ${companyId}`)

  const [connector] = await db
    .insert(ropChannelConnectors)
    .values({ companyId, kind: "telegram_bot", title: "Тестовый TG-чат", mode: "webhook", isEnabled: true, status: "active" })
    .returning({ id: ropChannelConnectors.id })

  const [counterparty] = await db
    .insert(ropCounterparties)
    .values({ companyId, kind: "client", name: "Тестовый клиент (общий чат на 3 сделки)" })
    .returning({ id: ropCounterparties.id })

  const threadKey = `test-chat-${Date.now()}`
  const baseTime = new Date()
  // Разносим сообщения по 3-7 минут друг от друга — реалистичный оживлённый чат,
  // но БЕЗ debounce-разрывов (>5 мин без сообщений), чтобы весь диалог тестировался
  // как один "живой" эпизод для rollup.ts после привязки.
  let cursor = baseTime.getTime()
  const insertedIds: string[] = []
  for (const [i, s] of SEED.entries()) {
    cursor += (2 + (i % 3)) * 60_000 // +2..4 мин
    const [row] = await db
      .insert(ropMessages)
      .values({
        companyId,
        connectorId: connector.id,
        threadKey,
        externalId: `msg-${i}`,
        counterpartyId: counterparty.id,
        direction: s.isOurs ? "out" : "in",
        authorExternalId: s.isOurs ? "manager-anya" : "client-1",
        authorName: s.author,
        isOurs: s.isOurs,
        text: s.text,
        sentAt: new Date(cursor),
        attributionStatus: "pending",
      })
      .returning({ id: ropMessages.id })
    insertedIds.push(row.id)
  }
  log(`вставлено ${insertedIds.length} сообщений в rop_messages, threadKey=${threadKey}`)

  // ---- Прогон каскада ----
  const t0 = Date.now()
  const attrResult = await attributeCompanyMessages(companyId, { budgetMs: 120_000, limit: 100 })
  const attrMs = Date.now() - t0

  log("=== РЕЗУЛЬТАТ attribution.ts ===")
  log(JSON.stringify(attrResult, null, 2))

  // ---- Разбор по сообщениям: куда попало каждое ----
  const links = await db
    .select({
      messageId: ropMessageDealLinks.messageId,
      dealThreadId: ropMessageDealLinks.dealThreadId,
      confidence: ropMessageDealLinks.confidence,
      method: ropMessageDealLinks.method,
    })
    .from(ropMessageDealLinks)
    .where(eq(ropMessageDealLinks.companyId, companyId))

  const linkByMsg = new Map(links.map((l) => [l.messageId, l]))
  const threads = await db.select().from(ropDealThreads).where(eq(ropDealThreads.companyId, companyId))
  const threadTitleById = new Map(threads.map((t) => [t.id, t.title ?? t.id.slice(0, 8)]))

  console.log("\n=== РАЗБИВКА ПО СООБЩЕНИЯМ (истина vs предсказание) ===")
  let correctByDealMajority = 0
  const dealToThreadVotes = new Map<string, Map<string, number>>()

  for (const [i, s] of SEED.entries()) {
    const msgId = insertedIds[i]
    const link = linkByMsg.get(msgId)
    const threadLabel = link ? threadTitleById.get(link.dealThreadId) ?? link.dealThreadId.slice(0, 8) : "—"
    console.log(
      `#${String(i + 1).padStart(2, "0")} [истина=${s.deal.padEnd(11)}] → нить="${threadLabel}" method=${link?.method ?? "НЕТ ПРИВЯЗКИ"} conf=${link?.confidence ?? "—"} | "${s.text.slice(0, 50)}..."`
    )
    if (link) {
      const votes = dealToThreadVotes.get(s.deal) ?? new Map<string, number>()
      votes.set(link.dealThreadId, (votes.get(link.dealThreadId) ?? 0) + 1)
      dealToThreadVotes.set(s.deal, votes)
    }
  }

  // Точность: для каждой истинной сделки берём "нить большинства" — сколько сообщений
  // этой сделки в неё попало (грубая proxy-метрика для синтетики без формального eval-набора).
  console.log("\n=== СВОДКА ПО СДЕЛКАМ ===")
  for (const [deal, votes] of dealToThreadVotes) {
    const total = SEED.filter((s) => s.deal === deal).length
    const [bestThread, bestCount] = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]
    correctByDealMajority += bestCount
    console.log(`  ${deal}: ${total} сообщений → нить большинства "${threadTitleById.get(bestThread) ?? bestThread.slice(0, 8)}" получила ${bestCount}/${total} (${((bestCount / total) * 100).toFixed(0)}%), разбито на ${votes.size} нитей`)
  }
  const purity = (correctByDealMajority / SEED.length) * 100
  console.log(`\n  ИТОГО purity (сообщения в нити большинства своей сделки) = ${correctByDealMajority}/${SEED.length} = ${purity.toFixed(1)}%`)
  console.log(`  Создано сделок-нитей всего: ${threads.length} (ожидалось ~3)`)

  const confidences = links.map((l) => Number(l.confidence)).filter((c) => !Number.isNaN(c))
  const avgConfidence = confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0
  console.log(`  Средняя уверенность привязки: ${avgConfidence.toFixed(3)}`)
  console.log(`  Время прогона attribution: ${attrMs}мс, AI-вызовов: ${attrResult.aiCalls}, gate-AI-вызовов: ${attrResult.gateAiCalls}, токенов потрачено: ${attrResult.tokensSpent}`)

  // ---- Прогон rollup ----
  const t1 = Date.now()
  // Двигаем "сейчас" эффективно вперёд: чтобы rollup счёл эпизод закрытым, ему нужно,
  // чтобы с последнего сообщения прошло >5 мин debounce ИЛИ сменился день ИЛИ было >=20
  // сообщений. У нас 30 сообщений в треде — первый эпизод закроется по лимиту 20 сам по
  // себе, второй (хвост) требует debounce/дня — тестируем именно это поведение честно,
  // без искусственного сдвига now().
  const rollupResult = await rollupCompanyMessages(companyId, { budgetMs: 30_000 })
  const rollupMs = Date.now() - t1
  console.log("\n=== РЕЗУЛЬТАТ rollup.ts ===")
  console.log(JSON.stringify(rollupResult, null, 2))
  console.log(`  Время прогона rollup: ${rollupMs}мс`)

  const episodes = await db.select().from(ropCalls).where(eq(ropCalls.tenantId, companyId))
  console.log(`  Эпизодов (rop_calls) создано: ${episodes.length}`)
  for (const ep of episodes) {
    console.log(`    - id=${ep.id.slice(0, 8)} channel=${ep.channel} durationSec=${ep.durationSec} dealThreadId=${ep.dealThreadId?.slice(0, 8) ?? "—"} contentText.length=${ep.contentText?.length ?? 0}`)
  }

  // ---- Печать финальных профилей нитей (для проверки инкрементального patch) ----
  console.log("\n=== ПРОФИЛИ СДЕЛОК-НИТЕЙ ===")
  for (const t of threads) {
    const full = await getThread(t.id)
    const p = full ? threadProfile(full) : null
    console.log(`  "${t.title}" (${t.id.slice(0, 8)}): status=${t.status} confidence=${t.confidence}`)
    if (p) {
      console.log(`    products=[${p.products.join(", ")}]`)
      console.log(`    amounts=[${p.amounts.join(", ")}]`)
      console.log(`    keyPhrases=[${p.keyPhrases.join(", ")}]`)
    }
  }

  if (!KEEP) {
    await db.delete(companies).where(eq(companies.id, companyId))
    log(`тестовая компания ${companyId} и весь её след удалены (CASCADE)`)
  } else {
    log(`--keep передан, тестовая компания ${companyId} оставлена в БД`)
  }
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
