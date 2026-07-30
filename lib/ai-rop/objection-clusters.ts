/**
 * Семантическая кластеризация возражений: раскладываем уникальные формулировки
 * по ФИКСИРОВАННОЙ таксономии категорий (DEFAULT_TAXONOMY, редактируема
 * per-tenant через rop_settings.settings.objectionTaxonomy). AI НЕ придумывает
 * категории — только относит каждую фразу к одной из заданных, батчами по 100
 * фраз (устойчивее, чем один вызов на 1500 позиций, где модель «плывёт» и
 * путает, например, тайминг («перезвонить позже») с «Техническими» или
 * «не строимся» с «Ценой»). Результат кэшируется в rop_objection_clusters
 * (map rawPhrase→category, PK=tenantId — один вычисленный снимок на тенанта,
 * пересчитывается целиком, как было в оригинале). Страница возражений
 * агрегирует ЖИВЫЕ счётчики по категориям, поэтому цифры свежие; пересчёт
 * категорий — по кнопке (AI-вызов платный).
 *
 * Порт call-agent lib/objection-clusters.ts. Отличия: вместо ca ai-provider —
 * прямой вызов lib/ai/client.ts::callClaudeSonnet (baseURL = claude-proxy,
 * модель из lib/ai/models.ts), тот же промпт и КРИТИЧНЫЙ фикс покрытия —
 * assignments остаётся ПОЗИЦИОННЫМ массивом индексов категорий (не JSON по
 * фразам), чтобы модель не теряла соответствие при батчировании. Каждый
 * AI-вызов логируется через logAiCall (ai_usage_log, action rop_objection_clusters).
 */
import { sql, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropObjectionClusters, ropSettings } from "@/lib/db/schema"
import { callClaudeSonnetMessagesWithUsage } from "@/lib/ai/client"
import { logAiCall } from "@/lib/ai/usage-log"
import { AI_MODEL_MAIN } from "@/lib/ai/models"

export interface ClusterCache { map: Record<string, string>; computedAt: string | null }

/** Прочитать кэш кластеров (map rawPhrase→category) или null если ещё не считали. */
export async function getClusterMap(tenantId: string): Promise<ClusterCache | null> {
  const [row] = await db
    .select({ mapJson: ropObjectionClusters.mapJson, computedAt: ropObjectionClusters.computedAt })
    .from(ropObjectionClusters)
    .where(eq(ropObjectionClusters.tenantId, tenantId))
    .limit(1)
  if (!row) return null
  const map = (row.mapJson as Record<string, string> | null) ?? {}
  return { map, computedAt: row.computedAt ? row.computedAt.toISOString() : null }
}

export interface TaxonomyCategory { name: string; def: string }

/** Фиксированная таксономия категорий возражений (дефолт, переопределяемый per-tenant). */
export const DEFAULT_TAXONOMY: TaxonomyCategory[] = [
  {
    name: "Не наш профиль / не по адресу",
    def: "клиент не связан со стройкой/металлом, ошиблись сферой/номером.",
  },
  {
    name: "Нет текущей потребности",
    def: "сейчас не строят и не закупают, нет актуального объекта/проекта. НЕ про «неудобно говорить» и НЕ про замороженный проект.",
  },
  {
    name: "Не вовремя для разговора",
    def: "разговор СОСТОЯЛСЯ (собеседник на линии, отвечает), но он говорит, что не может общаться ИМЕННО СЕЙЧАС: «перезвоните позже», «не могу говорить сейчас», «занят», «закончился рабочий день», «неудобно говорить», «за рулём». Это про неподходящий МОМЕНТ для разговора, а не про недозвон и не про потребность в продукте.",
  },
  {
    name: "Проект на паузе / заморожен",
    def: "объект/проект есть, но приостановлен: стройка отложена, сроки сдвинуты, финансирование проекта приостановлено.",
  },
  {
    name: "Цена / дорого",
    def: "возражение именно по стоимости: дорого, высокая цена, дешевле у других.",
  },
  {
    name: "Уже работают с другими",
    def: "есть свой поставщик/подрядчик металлоконструкций.",
  },
  {
    name: "Не ЛПР / не тот контакт",
    def: "не принимает решения, не знает кто отвечает за закупки, надо к другому.",
  },
  {
    name: "Технические вопросы / детали",
    def: "конкретные вопросы по продукту, узлам, параметрам, чертежам, документам.",
  },
  {
    name: "Нет бюджета / финансирования",
    def: "нет денег/бюджет не выделен В ПРИНЦИПЕ (не про конкретную цену и не про паузу проекта).",
  },
  {
    name: "Сроки поставки / производства",
    def: "не устраивают сроки изготовления/поставки.",
  },
  {
    name: "Качество / доверие / сомнения",
    def: "сомнения в качестве, надёжности, репутации.",
  },
  {
    name: "Категорический отказ / не звонить",
    def: "жёсткий отказ, просьба не беспокоить.",
  },
  {
    name: "Не дозвонились / нет контакта",
    def: "разговор ВООБЩЕ НЕ СОСТОЯЛСЯ технически: абонент недоступен/вне зоны, сброс звонка, длинные гудки без ответа, автоответчик. НЕ используй, если собеседник ответил и что-то сказал (даже «не могу говорить сейчас») — это уже состоявшийся контакт, см. «Не вовремя для разговора».",
  },
  {
    name: "Прочее",
    def: "только если фраза реально не подходит ни к одной категории.",
  },
]

/** Получить таксономию для тенанта: per-tenant override (rop_settings.settings.objectionTaxonomy) или дефолт. */
export async function getTaxonomy(tenantId: string): Promise<TaxonomyCategory[]> {
  const [row] = await db
    .select({ settings: ropSettings.settings })
    .from(ropSettings)
    .where(eq(ropSettings.companyId, tenantId))
    .limit(1)
  const raw = (row?.settings as Record<string, unknown> | null)?.objectionTaxonomy
  if (Array.isArray(raw) && raw.length > 0) {
    const cleaned = (raw as Array<{ name?: unknown; def?: unknown }>)
      .map((c) => ({ name: String(c?.name ?? "").trim(), def: String(c?.def ?? "").trim() }))
      .filter((c) => c.name)
    if (cleaned.length > 0) return cleaned
  }
  return DEFAULT_TAXONOMY
}

const BATCH_SIZE = 100

function buildSystem(categories: TaxonomyCategory[]): string {
  const catList = categories.map((c, i) => `${i}. ${c.name} — ${c.def}`).join("\n")
  return `Ты — руководитель отдела продаж. Тебе дают пронумерованный список возражений клиентов из звонков и ФИКСИРОВАННЫЙ список категорий с определениями. Твоя задача — только РАЗЛОЖИТЬ фразы по этим категориям, НЕ придумывая новые. Разбирай КАЖДУЮ фразу отдельно, не по одному ключевому слову, а по всей ситуации клиента.

ГЛАВНЫЕ ЛОВУШКИ (частые ошибки, ИЗБЕГАЙ их):
1. «Не могу говорить сейчас», «перезвоните позже», «занят», «закончился рабочий день», «неудобно говорить», «за рулём» — разговор с человеком СОСТОЯЛСЯ, он ответил и говорит. Это категория «Не вовремя для разговора». Это ТОЧНО НЕ категория «Не дозвонились / нет контакта» — та только для случаев, когда до человека физически не достучались (гудки без ответа, «абонент недоступен», сброс на середине набора, автоответчик). Проверка: если в тексте фразы клиент что-то ОТВЕТИЛ или ПОПРОСИЛ — это «Не вовремя», а не «Не дозвонились».
2. «Не строимся», «нет необходимости [в товаре/услуге]», «пока не актуально» — это «Нет текущей потребности», а НЕ «Цена / дорого».
3. «Финансирование приостановлено», «стройка отложена», «пауза в проекте» — конкретный проект существует, но стоит. Это «Проект на паузе / заморожен», а НЕ «Нет бюджета / финансирования» (там денег нет в принципе, без привязки к проекту) и НЕ «Цена / дорого».

Категории:
${catList}

Правило: относи каждую фразу к категории по СМЫСЛУ ситуации клиента, а не по совпадению слов. Каждой фразе — ровно одна категория, наиболее точно описывающая ситуацию. «Прочее» используй ТОЛЬКО если фраза реально не подходит ни к одной из остальных категорий.
Верни ТОЛЬКО JSON без пояснений: {"assignments": [индекс_категории, ...]} — массив длиной ровно как список фраз в этом батче. assignments[i] — индекс категории (0..${categories.length - 1}) для фразы №(i+1).`
}

function parseAssignments(text: string, expectedLen: number): number[] {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error("Ответ AI не содержит JSON")
  const parsed = JSON.parse(match[0]) as { assignments?: unknown }
  const arr = Array.isArray(parsed.assignments) ? parsed.assignments : []
  if (arr.length !== expectedLen) {
    // Не бросаем — берём что есть, недостающие останутся без категории (fail-soft).
    console.warn(`[objection-clusters] assignments length mismatch: expected ${expectedLen}, got ${arr.length}`)
  }
  return arr.map((x) => Number(x))
}

/** Пересчитать кластеры через AI (батчами) и сохранить. Возвращает map + число категорий. */
export async function computeClusterMap(tenantId: string): Promise<{ ok: boolean; categories: number; phrases: number; error?: string }> {
  // Уникальные формулировки возражений тенанта
  const rows = (await db.execute(sql`
    SELECT a.objections_json AS objections_json
    FROM rop_analyses a JOIN rop_calls c ON c.id = a.call_id
    WHERE c.tenant_id = ${tenantId}::uuid
      AND a.objections_json IS NOT NULL AND jsonb_array_length(a.objections_json) > 0
  `)) as unknown as Array<{ objections_json: unknown }>

  const uniq = new Map<string, number>()
  for (const r of rows) {
    const arr = Array.isArray(r.objections_json) ? (r.objections_json as unknown[]) : []
    for (const o of arr) {
      const raw = String(o ?? "").trim()
      if (raw) uniq.set(raw, (uniq.get(raw) ?? 0) + 1)
    }
  }
  const phrases = [...uniq.keys()]
  if (phrases.length === 0) return { ok: false, categories: 0, phrases: 0, error: "Нет возражений для группировки" }

  // Все уникальные формулировки (по частоте), потолок на общий объём.
  const ranked = [...uniq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 1500).map(([p]) => p)

  const categories = await getTaxonomy(tenantId)
  const system = buildSystem(categories)

  const map: Record<string, string> = {}
  for (let start = 0; start < ranked.length; start += BATCH_SIZE) {
    const batch = ranked.slice(start, start + BATCH_SIZE)
    const list = batch.map((p, i) => `${i + 1}. ${p}`).join("\n")

    let assign: number[]
    try {
      const { text, usage } = await callClaudeSonnetMessagesWithUsage(
        [{ role: "user", content: `Возражения (${batch.length} шт.):\n${list}\n\nВерни assignments длиной ровно ${batch.length}.` }],
        system,
        4000
      )
      void logAiCall({
        tenantId, action: "rop_objection_clusters", model: AI_MODEL_MAIN,
        inputTokens: usage.input_tokens, outputTokens: usage.output_tokens,
      })
      assign = parseAssignments(text, batch.length)
    } catch (e) {
      return { ok: false, categories: 0, phrases: phrases.length, error: (e as Error).message }
    }

    for (let i = 0; i < batch.length; i++) {
      const ci = assign[i]
      const name = Number.isInteger(ci) && ci >= 0 && ci < categories.length ? categories[ci].name : ""
      if (name) map[batch[i]] = name
    }
  }

  const catCount = new Set(Object.values(map)).size
  if (Object.keys(map).length === 0) return { ok: false, categories: 0, phrases: phrases.length, error: "AI не вернул группировку" }

  await db
    .insert(ropObjectionClusters)
    .values({ tenantId, mapJson: map, computedAt: new Date() })
    .onConflictDoUpdate({
      target: ropObjectionClusters.tenantId,
      set: { mapJson: map, computedAt: new Date() },
    })

  return { ok: true, categories: catCount, phrases: Object.keys(map).length }
}
