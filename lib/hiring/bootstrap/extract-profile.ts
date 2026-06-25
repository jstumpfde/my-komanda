// Фаза 1 онбординга: Claude по тексту сайта извлекает профиль компании/продуктов.
// Только факты из текста — ничего не выдумывать. Возвращает черновик для РЕВЬЮ
// (не сохраняет). Структуры — под ProductProfile (lib/hiring/product-profile).

import Anthropic from "@anthropic-ai/sdk"
import { getClaudeApiUrl } from "@/lib/claude-proxy"
import {
  DEAL_CYCLES, SALES_CHANNELS, makeProductProfile, type ProductProfile,
} from "@/lib/hiring/product-profile"

const client = new Anthropic({ baseURL: getClaudeApiUrl() })

const DEAL_CYCLE_VALUES = DEAL_CYCLES.map((c) => c.v)
const CHANNEL_VALUES = SALES_CHANNELS.map((c) => c.v)

const SYSTEM = `Ты — аналитик. По тексту сайта компании извлекаешь профиль для найма (под продажников и клиентоориентированные роли).

ПРАВИЛА:
- Опирайся ТОЛЬКО на факты из текста сайта. НИЧЕГО не выдумывай. Если данных нет — оставляй поле пустым (пустая строка/массив/null).
- Описание компании — нейтральное, для кандидатов, 2–4 предложения, без рекламных клише («лучший», «уникальный», «лидер рынка» — только если прямо сказано).
- Продукты/услуги — то, что компания продаёт. Если их несколько разных — раздели на отдельные продукты. Если по сути одно направление — один продукт.
- salesType — отрасль/тип продаж человекочитаемо (напр. «Металлоконструкции», «SaaS», «Строительные материалы», «B2B-услуги»).
- icp — кто покупатель/ЛПР, если понятно из текста.
- channels — только из набора: cold, inbound, partners, referrals, events (если явно следует из текста; иначе []).
- dealCycle — только из набора: 1d, 2-7d, 1-4w, 1-3m, 3m+ (если можно оценить; иначе null).
- checkMin/checkMax — числа в рублях, если цены есть на сайте; иначе null. recurring — true если подписка/абонплата.
- objections — типичные возражения по продукту, если их можно вывести; иначе [].

ФОРМАТ ОТВЕТА: СТРОГО валидный JSON без markdown, без пояснений:
{
  "companyDescription": "string",
  "products": [
    {
      "name": "string",
      "productDescription": "string",
      "salesType": "string",
      "icp": "string",
      "channels": ["cold"],
      "dealCycle": "1-4w" | null,
      "checkMin": number | null,
      "checkMax": number | null,
      "recurring": boolean,
      "objections": ["string"]
    }
  ]
}`

export interface ExtractResult {
  companyDescription: string
  products: ProductProfile[]
}

type RawProduct = {
  name?: unknown; productDescription?: unknown; salesType?: unknown; icp?: unknown
  channels?: unknown; dealCycle?: unknown; checkMin?: unknown; checkMax?: unknown
  recurring?: unknown; objections?: unknown
}

function str(v: unknown): string { return typeof v === "string" ? v.trim() : "" }
function num(v: unknown): number | null { return typeof v === "number" && isFinite(v) ? Math.max(0, Math.round(v)) : null }

function toProfile(raw: RawProduct, i: number): ProductProfile {
  const base = makeProductProfile(str(raw.name) || `Продукт ${i + 1}`)
  const min = num(raw.checkMin) ?? 0
  const max = num(raw.checkMax)
  const dealCycle = DEAL_CYCLE_VALUES.includes(str(raw.dealCycle) as never) ? str(raw.dealCycle) : base.dealCycle
  const channels = Array.isArray(raw.channels)
    ? (raw.channels as unknown[]).map(str).filter((c) => CHANNEL_VALUES.includes(c as never))
    : []
  const objections = Array.isArray(raw.objections)
    ? (raw.objections as unknown[]).map(str).filter(Boolean).slice(0, 5)
    : []
  return {
    ...base,
    name: str(raw.name) || base.name,
    productDescription: str(raw.productDescription),
    salesType: str(raw.salesType),
    icp: str(raw.icp),
    dealCycle,
    channels,
    objections,
    checkRange: { min, max, recurring: raw.recurring === true },
  }
}

/** Извлекает профиль компании/продуктов из текста сайта. Бросает при невалидном AI-ответе. */
export async function extractProfileFromSiteText(siteText: string): Promise<ExtractResult> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2500,
    system: SYSTEM,
    messages: [{
      role: "user",
      content: `Текст сайта компании (главная + внутренние страницы):\n\n${siteText}\n\nИзвлеки профиль строго в заданном JSON-формате.`,
    }],
  })

  const block = response.content.find((b) => b.type === "text")
  const text = block && block.type === "text" ? block.text : ""
  // На случай обёрток ```json — вырезаем JSON-объект.
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error("AI вернул не-JSON")

  const parsed = JSON.parse(jsonMatch[0]) as { companyDescription?: unknown; products?: unknown }
  const products = Array.isArray(parsed.products)
    ? (parsed.products as RawProduct[]).map(toProfile).filter((p) => p.name || p.productDescription)
    : []

  return {
    companyDescription: str(parsed.companyDescription),
    products: products.length ? products : [],
  }
}
